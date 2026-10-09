import { and, asc, eq, inArray } from "drizzle-orm";
import { findCart } from "../cart/service";
import type { Database, Executor } from "../db/create";
import {
  cartItems,
  carts,
  couponRedemptions,
  orderEvents,
  orderItems,
  orders,
  payments,
  products,
  productVariants,
  stockReservations,
  webhookEvents,
  type AddressSnapshot,
} from "../db/schema";
import { generateOrderRef, generateToken, hashToken, tokenMatchesHash } from "../domain/identifiers";
import {
  consumeReservations,
  findExpiredReservationOrders,
  InsufficientStockError,
  releaseReservations,
  reserveStock,
} from "../domain/inventory";
import { nextInvoiceNumber } from "../domain/invoices";
import { assertTransition, type OrderStatus } from "../domain/order-status";
import { IntegrationNotConfiguredError } from "../services/errors";
import { applyRefundUpdate, type Notification } from "../orders/lifecycle";
import type { PaymentProvider, ProviderPayment } from "../services/payment";
import type { ShippingProvider } from "../services/shipping";
import { buildQuote, checkoutReadiness, loadCheckoutSettings, type Quote } from "./quote";
import type { Address, CheckoutData } from "./schema";

/**
 * Checkout and payment lifecycle.
 *
 *   placeOrder        price on the server → hold stock → create order → create Razorpay order
 *   confirmClientPayment  verify the browser's signature, then ask Razorpay for the real status
 *   handleRazorpayWebhook  signed, deduplicated — the source of truth for "paid"
 *   markPaid / markFailed  idempotent state changes, row-locked
 *   retryPayment      re-hold stock and reopen a failed or abandoned payment
 *   expireStaleOrders release holds on orders nobody paid for
 *
 * An order is never marked paid because the browser said so.
 */

export type CheckoutDeps = {
  payment: PaymentProvider;
  /** When Shiprocket is connected, undeliverable PIN codes are refused before payment */
  shipping?: ShippingProvider;
  paymentsConfigured: boolean;
  appEnv: string | undefined;
  now?: () => Date;
};

export type PaymentLaunch = {
  kind: "razorpay";
  orderRef: string;
  accessToken: string;
  keyId: string;
  providerOrderId: string;
  amount: number;
  prefill: { name: string; email: string; contact: string };
};

export type PlaceOrderResult =
  | PaymentLaunch
  | { kind: "confirmed"; orderRef: string; accessToken: string; orderId: string }
  | { kind: "changed"; quote: Quote; message: string }
  | { kind: "error"; message: string };

function isUniqueViolation(error: unknown, constraint: string) {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const e = current as { code?: string; constraint_name?: string; cause?: unknown };
    if (e.code === "23505" && e.constraint_name === constraint) return true;
    current = e.cause;
  }
  return false;
}

function snapshot(a: Address): AddressSnapshot {
  return {
    fullName: a.fullName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 || null,
    landmark: a.landmark || null,
    city: a.city,
    stateCode: a.stateCode,
    pincode: a.pincode,
    country: "IN",
  };
}

async function logEvent(
  tx: Executor,
  orderId: string,
  from: OrderStatus | null,
  to: OrderStatus,
  actor: string,
  note?: string,
) {
  await tx.insert(orderEvents).values({ orderId, fromStatus: from, toStatus: to, actor, note });
}

async function setStatus(
  tx: Executor,
  order: { id: string; status: OrderStatus },
  to: OrderStatus,
  actor: string,
  note?: string,
) {
  assertTransition(order.status, to);
  await tx.update(orders).set({ status: to }).where(eq(orders.id, order.id));
  await logEvent(tx, order.id, order.status, to, actor, note);
  order.status = to;
}

async function lockOrder(tx: Executor, where: ReturnType<typeof eq>) {
  const [order] = await tx.select().from(orders).where(where).for("update");
  return order ?? null;
}

/** Remove the purchased pieces (and a used coupon) from the bag the order came from. */
async function clearPurchasedFromCart(tx: Executor, order: typeof orders.$inferSelect) {
  if (!order.cartId) return;
  const items = await tx
    .select({ variantId: orderItems.variantId })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));
  const variantIds = items.map((i) => i.variantId).filter((v): v is string => Boolean(v));
  if (variantIds.length) {
    await tx
      .delete(cartItems)
      .where(and(eq(cartItems.cartId, order.cartId), inArray(cartItems.variantId, variantIds)));
  }
  await tx
    .update(carts)
    .set({ couponId: null, giftWrap: false, giftMessage: null, hidePrices: false })
    .where(eq(carts.id, order.cartId));
}

/** Coupon use, invoice number and bag clean-up once an order is confirmed (paid or COD). */
async function finaliseConfirmedOrder(tx: Executor, order: typeof orders.$inferSelect, now: Date) {
  if (order.couponId && order.discountTotal > 0) {
    await tx
      .insert(couponRedemptions)
      .values({
        couponId: order.couponId,
        orderId: order.id,
        userId: order.userId,
        email: order.email,
        amount: order.discountTotal,
      })
      .onConflictDoNothing();
  }
  if (!order.invoiceNumber) {
    const invoiceNumber = await nextInvoiceNumber(tx, now);
    await tx.update(orders).set({ invoiceNumber, invoiceDate: now }).where(eq(orders.id, order.id));
  }
  await clearPurchasedFromCart(tx, order);
}

async function productSlugsFor(tx: Executor, orderId: string) {
  const rows = await tx
    .selectDistinct({ slug: products.slug })
    .from(orderItems)
    .innerJoin(products, eq(products.id, orderItems.productId))
    .where(eq(orderItems.orderId, orderId));
  return rows.map((r) => r.slug);
}

export async function placeOrder(
  db: Database,
  deps: CheckoutDeps,
  params: { cartTokenHash: string | null; input: CheckoutData; userId?: string | null },
): Promise<PlaceOrderResult> {
  const now = deps.now?.() ?? new Date();
  const { input } = params;
  const settings = await loadCheckoutSettings(db);
  const readiness = checkoutReadiness(settings, {
    paymentsConfigured: deps.paymentsConfigured,
    appEnv: deps.appEnv,
  });
  if (!readiness.ready) return { kind: "error", message: readiness.reason };
  if (!readiness.paymentMethods.includes(input.paymentMethod)) {
    return { kind: "error", message: "That payment method isn't available. Please choose another." };
  }

  // A double submit returns the order the first click created
  const [existing] = await db.select().from(orders).where(eq(orders.idempotencyKey, input.idempotencyKey));
  if (existing)
    return {
      kind: "error",
      message: "This order was already submitted. Check your email or refresh the page.",
    };

  const cart = params.cartTokenHash ? await findCart(db, params.cartTokenHash, now) : null;
  if (!cart) return { kind: "error", message: "Your bag is empty." };

  const quote = await buildQuote(db, cart, settings, {
    email: input.email,
    placeOfSupplyStateCode: input.shipping.stateCode,
    shippingMethod: input.shippingMethod,
    paymentMethod: input.paymentMethod,
  });
  if (quote.problems.length) return { kind: "error", message: quote.problems[0] };
  if (input.expectedTotal !== undefined && input.expectedTotal !== quote.total) {
    return {
      kind: "changed",
      quote,
      message: "Your total has changed since you last looked. Please review it before paying.",
    };
  }
  if (deps.shipping?.name === "shiprocket") {
    const weights = await db
      .select({ id: productVariants.id, packed: productVariants.packedWeightG, net: productVariants.weightG })
      .from(productVariants)
      .where(
        inArray(
          productVariants.id,
          quote.lines.map((l) => l.variantId),
        ),
      );
    const weightG = quote.lines.reduce((sum, l) => {
      const w = weights.find((x) => x.id === l.variantId);
      return sum + (w?.packed ?? w?.net ?? 1000) * l.quantity;
    }, 0);
    try {
      const serviceable = await deps.shipping.checkServiceability({
        deliveryPincode: input.shipping.pincode,
        weightG,
        cod: input.paymentMethod === "cod",
      });
      if (serviceable.status === "not_serviceable") {
        return {
          kind: "error",
          message: `Sorry — we can't deliver to ${input.shipping.pincode} yet. Please use another address.`,
        };
      }
    } catch {
      // Shiprocket unavailable: don't block the order; the owner confirms before dispatch
    }
  }
  if (input.paymentMethod === "razorpay" && quote.total < 100) {
    return { kind: "error", message: "Orders under ₹1 can't be paid online." };
  }

  const accessToken = generateToken();
  const isCod = input.paymentMethod === "cod";
  const billing = input.billingSameAsShipping || !input.billing ? input.shipping : input.billing;

  let created: typeof orders.$inferSelect;
  try {
    created = await db.transaction(async (tx) => {
      let order: typeof orders.$inferSelect | undefined;
      for (let attempt = 0; attempt < 5 && !order; attempt++) {
        const rows = await tx
          .insert(orders)
          .values({
            publicRef: generateOrderRef(),
            accessTokenHash: hashToken(accessToken),
            idempotencyKey: input.idempotencyKey,
            userId: params.userId ?? null,
            cartId: cart.id,
            paymentMethod: input.paymentMethod,
            email: input.email,
            phone: input.shipping.phone,
            status: "pending_payment",
            subtotal: quote.subtotal,
            discountTotal: quote.discountTotal,
            shippingTotal: quote.shippingTotal,
            giftWrapTotal: quote.giftWrapTotal,
            codFee: quote.codFee,
            total: quote.total,
            taxTotal: quote.taxTotal,
            cgst: quote.cgst,
            sgst: quote.sgst,
            igst: quote.igst,
            sellerStateCode: settings.seller.stateCode,
            shippingAddress: snapshot(input.shipping),
            billingAddress: snapshot(billing),
            billingGstin: input.gstin ?? null,
            shippingMethod: quote.shippingMethod,
            couponId: quote.coupon?.id ?? null,
            couponCode: quote.coupon?.code ?? null,
            giftWrap: quote.gift.wrap,
            giftMessage: quote.gift.message,
            hidePrices: quote.gift.hidePrices,
            customerNote: input.customerNote || null,
            isTest: isCod ? deps.appEnv !== "production" : deps.payment.isTestMode,
            placedAt: now,
          })
          .onConflictDoNothing({ target: orders.publicRef })
          .returning();
        order = rows[0];
      }
      if (!order) throw new Error("Could not allocate an order reference");

      await tx.insert(orderItems).values(
        quote.lines.map((l) => ({
          orderId: order.id,
          variantId: l.variantId,
          productId: l.productId,
          productName: l.name,
          variantName: l.variantName,
          sku: l.sku,
          image: l.image?.src ?? null,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          discount: l.discount,
          lineTotal: l.lineTotal,
          hsnCode: l.hsnCode,
          gstRateBp: l.gstRateBp,
          taxAmount: l.tax,
        })),
      );
      await logEvent(tx, order.id, null, "pending_payment", "customer");

      await reserveStock(tx, {
        orderId: order.id,
        lines: quote.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        expiresAt: new Date(now.getTime() + settings.checkout.reservationMinutes * 60_000),
      });

      if (isCod) {
        await consumeReservations(tx, order.id, order.publicRef);
        await setStatus(tx, order, "confirmed_cod", "customer");
        await tx
          .insert(payments)
          .values({ orderId: order.id, provider: "cod", amount: quote.total, status: "created" });
        await finaliseConfirmedOrder(tx, order, now);
      } else {
        await tx
          .insert(payments)
          .values({ orderId: order.id, provider: "razorpay", amount: quote.total, status: "created" });
      }
      return order;
    });
  } catch (error) {
    if (isUniqueViolation(error, "orders_idempotency_key_unique")) {
      return {
        kind: "error",
        message: "This order was already submitted. Check your email or refresh the page.",
      };
    }
    if (error instanceof InsufficientStockError) {
      const line = quote.lines.find((l) => l.variantId === error.variantId);
      return {
        kind: "error",
        message: line
          ? `${line.name}${line.variantName ? ` (${line.variantName})` : ""} has just been reserved by another customer. Please update your bag.`
          : "A piece in your bag has just sold out. Please update your bag.",
      };
    }
    throw error;
  }

  if (isCod) return { kind: "confirmed", orderRef: created.publicRef, accessToken, orderId: created.id };

  const launch = await openProviderOrder(db, deps, created, accessToken);
  if (launch.kind === "error") {
    // Payment couldn't start: give the stock back and close the order
    await db.transaction(async (tx) => {
      const order = await lockOrder(tx, eq(orders.id, created.id));
      if (order?.status === "pending_payment") {
        await releaseReservations(tx, order.id);
        await setStatus(tx, order, "cancelled", "system", "Payment could not be started");
        await tx
          .update(payments)
          .set({ status: "failed", errorDescription: launch.message })
          .where(eq(payments.orderId, order.id));
      }
    });
  }
  return launch;
}

/** Create (or reuse) the Razorpay order for an order and return what the browser needs. */
async function openProviderOrder(
  db: Database,
  deps: CheckoutDeps,
  order: typeof orders.$inferSelect,
  accessToken: string,
): Promise<PaymentLaunch | { kind: "error"; message: string }> {
  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, order.id), eq(payments.provider, "razorpay")))
    .orderBy(asc(payments.createdAt))
    .limit(1);
  let providerOrderId = payment?.providerOrderId ?? null;

  if (!providerOrderId) {
    try {
      const providerOrder = await deps.payment.createOrder({
        amount: order.total,
        currency: "INR",
        receipt: order.publicRef,
        notes: { order_ref: order.publicRef },
      });
      providerOrderId = providerOrder.id;
      await db.update(payments).set({ providerOrderId }).where(eq(payments.id, payment.id));
    } catch (error) {
      return {
        kind: "error",
        message:
          error instanceof IntegrationNotConfiguredError
            ? "Online payment isn't available yet."
            : "We couldn't start the payment. Please try again in a moment.",
      };
    }
  }

  const shipping = order.shippingAddress;
  return {
    kind: "razorpay",
    orderRef: order.publicRef,
    accessToken,
    keyId: deps.payment.publicKey,
    providerOrderId,
    amount: order.total,
    prefill: { name: shipping.fullName, email: order.email, contact: shipping.phone },
  };
}

/** Strip personal data before storing a provider payload. */
function sanitisePayment(p: Partial<ProviderPayment> & Record<string, unknown>) {
  return {
    id: p.id,
    order_id: p.orderId ?? (p as { order_id?: string }).order_id,
    status: p.status,
    method: p.method,
    amount: p.amount,
    error_code: p.errorCode ?? (p as { error_code?: string }).error_code,
  };
}

export type PaymentOutcome =
  | { kind: "paid"; orderId: string; slugs: string[]; alreadyProcessed: boolean }
  | { kind: "refund_required"; orderId: string; slugs: string[] }
  | { kind: "failed"; orderId: string }
  | { kind: "pending"; orderId: string }
  | { kind: "ignored"; reason: string };

/**
 * Record a captured payment. Safe to call any number of times, from the webhook and the
 * browser confirmation concurrently — the order row lock makes exactly one call do the work.
 */
export async function markPaid(
  db: Database,
  payment: { providerOrderId: string; providerPaymentId: string; amount: number; method: string | null },
  options: { actor: string; now?: Date } = { actor: "system" },
): Promise<PaymentOutcome> {
  const now = options.now ?? new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(payments)
      .where(eq(payments.providerOrderId, payment.providerOrderId))
      .for("update");
    if (!row)
      return { kind: "ignored" as const, reason: `Unknown provider order ${payment.providerOrderId}` };
    const order = await lockOrder(tx, eq(orders.id, row.orderId));
    if (!order) return { kind: "ignored" as const, reason: "Order missing" };

    const confirmedStates: OrderStatus[] = ["pending_payment", "payment_failed", "expired"];
    if (!confirmedStates.includes(order.status)) {
      return { kind: "paid" as const, orderId: order.id, slugs: [], alreadyProcessed: true };
    }

    await tx
      .update(payments)
      .set({
        status: "captured",
        providerPaymentId: payment.providerPaymentId,
        method: payment.method,
        errorCode: null,
        errorDescription: null,
        raw: sanitisePayment({
          id: payment.providerPaymentId,
          orderId: payment.providerOrderId,
          amount: payment.amount,
          method: payment.method,
          status: "captured",
        }),
      })
      .where(eq(payments.id, row.id));

    if (payment.amount !== order.total) {
      // Razorpay fixes the amount on the order, so this should never happen; never ship on it
      await tx
        .update(orders)
        .set({
          internalNote: `Captured ${payment.amount} paise but order total is ${order.total}. Investigate before fulfilling.`,
        })
        .where(eq(orders.id, order.id));
      await setStatus(tx, order, "paid", options.actor, "Amount mismatch");
      await setStatus(tx, order, "refund_pending", "system", "Captured amount does not match the order");
      return { kind: "refund_required" as const, orderId: order.id, slugs: [] };
    }

    // The stock hold may have lapsed (slow payment); try to take the stock again
    const active = await tx
      .select({ id: stockReservations.id })
      .from(stockReservations)
      .where(and(eq(stockReservations.orderId, order.id), eq(stockReservations.status, "active")));
    if (active.length === 0) {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      try {
        await reserveStock(tx, {
          orderId: order.id,
          lines: items
            .filter((i) => i.variantId)
            .map((i) => ({ variantId: i.variantId!, quantity: i.quantity })),
          expiresAt: new Date(now.getTime() + 60_000),
        });
      } catch (error) {
        if (!(error instanceof InsufficientStockError)) throw error;
        await tx.update(orders).set({ paidAt: now }).where(eq(orders.id, order.id));
        await setStatus(tx, order, "paid", options.actor, "Payment captured after the stock hold expired");
        await setStatus(tx, order, "refund_pending", "system", "Stock no longer available — refund required");
        await tx
          .update(orders)
          .set({ internalNote: "Paid after the hold expired and the stock had sold. Refund the customer." })
          .where(eq(orders.id, order.id));
        return { kind: "refund_required" as const, orderId: order.id, slugs: [] };
      }
    }

    await consumeReservations(tx, order.id, order.publicRef);
    await tx.update(orders).set({ paidAt: now }).where(eq(orders.id, order.id));
    await setStatus(tx, order, "paid", options.actor);
    await finaliseConfirmedOrder(tx, order, now);
    return {
      kind: "paid" as const,
      orderId: order.id,
      slugs: await productSlugsFor(tx, order.id),
      alreadyProcessed: false,
    };
  });
}

/** Record a failed attempt and give the stock back. The customer can retry. */
export async function markFailed(
  db: Database,
  payment: {
    providerOrderId: string;
    providerPaymentId?: string;
    errorCode?: string | null;
    errorDescription?: string | null;
  },
  options: { actor: string } = { actor: "system" },
): Promise<PaymentOutcome> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(payments)
      .where(eq(payments.providerOrderId, payment.providerOrderId))
      .for("update");
    if (!row)
      return { kind: "ignored" as const, reason: `Unknown provider order ${payment.providerOrderId}` };
    const order = await lockOrder(tx, eq(orders.id, row.orderId));
    if (!order || order.status !== "pending_payment") {
      return { kind: "ignored" as const, reason: `Order is ${order?.status ?? "missing"}` };
    }
    await tx
      .update(payments)
      .set({
        status: "failed",
        providerPaymentId: payment.providerPaymentId ?? row.providerPaymentId,
        errorCode: payment.errorCode ?? null,
        errorDescription: payment.errorDescription?.slice(0, 300) ?? null,
      })
      .where(eq(payments.id, row.id));
    await releaseReservations(tx, order.id);
    await setStatus(tx, order, "payment_failed", options.actor, payment.errorCode ?? undefined);
    return { kind: "failed" as const, orderId: order.id };
  });
}

/**
 * The browser says the payment succeeded. Verify Razorpay's signature, then ask Razorpay
 * directly for the payment status — only a captured payment marks the order paid.
 */
export async function confirmClientPayment(
  db: Database,
  provider: PaymentProvider,
  input: { providerOrderId: string; providerPaymentId: string; signature: string },
): Promise<PaymentOutcome | { kind: "invalid" }> {
  const valid = provider.verifyPaymentSignature({
    orderId: input.providerOrderId,
    paymentId: input.providerPaymentId,
    signature: input.signature,
  });
  if (!valid) return { kind: "invalid" };

  const payment = await provider.fetchPayment(input.providerPaymentId);
  if (payment.orderId !== input.providerOrderId) return { kind: "invalid" };
  if (payment.status === "captured") {
    return markPaid(
      db,
      {
        providerOrderId: input.providerOrderId,
        providerPaymentId: payment.id,
        amount: payment.amount,
        method: payment.method,
      },
      { actor: "customer" },
    );
  }
  if (payment.status === "failed") {
    return markFailed(db, {
      providerOrderId: input.providerOrderId,
      providerPaymentId: payment.id,
      errorCode: payment.errorCode,
      errorDescription: payment.errorDescription,
    });
  }
  // Authorised but not yet captured: the webhook will confirm it
  const [row] = await db
    .select({ orderId: payments.orderId })
    .from(payments)
    .where(eq(payments.providerOrderId, input.providerOrderId));
  return row ? { kind: "pending", orderId: row.orderId } : { kind: "ignored", reason: "Unknown order" };
}

type RazorpayWebhook = {
  event: string;
  payload?: {
    refund?: { entity?: { id: string; payment_id: string; amount: number; status: string } };
    payment?: {
      entity?: {
        id: string;
        order_id: string | null;
        amount: number;
        status: string;
        method?: string | null;
        error_code?: string | null;
        error_description?: string | null;
      };
    };
  };
};

/**
 * Razorpay webhook. Verified against the raw body, recorded once per event id, and safe to
 * receive repeatedly — Razorpay retries until it gets a 2xx.
 */
export async function handleRazorpayWebhook(
  db: Database,
  provider: PaymentProvider,
  request: { rawBody: string; signature: string | null; eventId: string | null },
): Promise<{
  status: 200 | 400 | 401;
  outcome?: PaymentOutcome;
  duplicate?: boolean;
  notifications?: Notification[];
}> {
  if (!request.signature || !provider.verifyWebhookSignature(request.rawBody, request.signature))
    return { status: 401 };

  let body: RazorpayWebhook;
  try {
    body = JSON.parse(request.rawBody) as RazorpayWebhook;
  } catch {
    return { status: 400 };
  }
  const eventId = request.eventId ?? `body:${hashToken(request.rawBody)}`;

  const inserted = await db
    .insert(webhookEvents)
    .values({ provider: "razorpay", eventId, type: body.event, payload: body })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  let recordId = inserted[0]?.id;
  if (!recordId) {
    const [existing] = await db
      .select()
      .from(webhookEvents)
      .where(and(eq(webhookEvents.provider, "razorpay"), eq(webhookEvents.eventId, eventId)));
    if (existing?.processedAt) return { status: 200, duplicate: true };
    recordId = existing?.id; // an earlier delivery failed part-way: process again
  }

  const entity = body.payload?.payment?.entity;
  let outcome: PaymentOutcome = { kind: "ignored", reason: `Unhandled event ${body.event}` };
  let notifications: Notification[] = [];
  const refundEntity = body.payload?.refund?.entity;
  try {
    if (entity?.order_id && (body.event === "payment.captured" || body.event === "order.paid")) {
      outcome = await markPaid(
        db,
        {
          providerOrderId: entity.order_id,
          providerPaymentId: entity.id,
          amount: entity.amount,
          method: entity.method ?? null,
        },
        { actor: "webhook:razorpay" },
      );
    } else if (refundEntity?.id && (body.event === "refund.processed" || body.event === "refund.failed")) {
      notifications = await applyRefundUpdate(db, {
        providerRefundId: refundEntity.id,
        status: body.event === "refund.processed" ? "processed" : "failed",
      });
      outcome = { kind: "ignored", reason: `Refund ${refundEntity.id} ${body.event.split(".")[1]}` };
    } else if (entity?.order_id && body.event === "payment.failed") {
      outcome = await markFailed(
        db,
        {
          providerOrderId: entity.order_id,
          providerPaymentId: entity.id,
          errorCode: entity.error_code,
          errorDescription: entity.error_description,
        },
        { actor: "webhook:razorpay" },
      );
    }
    if (recordId)
      await db
        .update(webhookEvents)
        .set({ processedAt: new Date(), error: null })
        .where(eq(webhookEvents.id, recordId));
    return { status: 200, outcome, notifications };
  } catch (error) {
    if (recordId) {
      await db
        .update(webhookEvents)
        .set({ error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error" })
        .where(eq(webhookEvents.id, recordId));
    }
    throw error;
  }
}

/** Find an order the visitor is allowed to see (guest link token). */
export async function findOrderForCustomer(db: Executor, orderRef: string, accessToken: string) {
  const [order] = await db.select().from(orders).where(eq(orders.publicRef, orderRef));
  if (!order || !accessToken || !tokenMatchesHash(accessToken, order.accessTokenHash)) return null;
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.createdAt));
  return { order, items };
}

/** Reopen payment for an order whose attempt failed or whose hold expired. */
export async function retryPayment(
  db: Database,
  deps: CheckoutDeps,
  params: { orderRef: string; accessToken: string },
): Promise<PaymentLaunch | { kind: "error"; message: string }> {
  const now = deps.now?.() ?? new Date();
  const settings = await loadCheckoutSettings(db);
  const found = await findOrderForCustomer(db, params.orderRef, params.accessToken);
  if (!found) return { kind: "error", message: "We couldn't find that order." };
  if (found.order.paymentMethod !== "razorpay")
    return { kind: "error", message: "This order doesn't need an online payment." };

  try {
    await db.transaction(async (tx) => {
      const order = await lockOrder(tx, eq(orders.id, found.order.id));
      if (!order || !["pending_payment", "payment_failed", "expired"].includes(order.status)) {
        throw new Error("not-retryable");
      }
      const active = await tx
        .select({ id: stockReservations.id })
        .from(stockReservations)
        .where(and(eq(stockReservations.orderId, order.id), eq(stockReservations.status, "active")));
      if (active.length === 0) {
        await reserveStock(tx, {
          orderId: order.id,
          lines: found.items
            .filter((i) => i.variantId)
            .map((i) => ({ variantId: i.variantId!, quantity: i.quantity })),
          expiresAt: new Date(now.getTime() + settings.checkout.reservationMinutes * 60_000),
        });
      }
      if (order.status !== "pending_payment")
        await setStatus(tx, order, "pending_payment", "customer", "Retrying payment");
    });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return {
        kind: "error",
        message: "Sorry — a piece in this order has since sold. Nothing has been charged.",
      };
    }
    if (error instanceof Error && error.message === "not-retryable") {
      return { kind: "error", message: "This order can no longer be paid. Please start a new order." };
    }
    throw error;
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, found.order.id));
  return openProviderOrder(db, deps, order, params.accessToken);
}

/** Cron: release holds on unpaid orders past their reservation time. */
export async function expireStaleOrders(db: Database, now = new Date()) {
  const orderIds = await findExpiredReservationOrders(db, now);
  let expired = 0;
  for (const orderId of orderIds) {
    await db.transaction(async (tx) => {
      const order = await lockOrder(tx, eq(orders.id, orderId));
      if (!order) return;
      await releaseReservations(tx, order.id, "expired");
      if (order.status === "pending_payment" || order.status === "payment_failed") {
        await setStatus(tx, order, "expired", "system", "Payment not completed in time");
        expired++;
      }
    });
  }
  return { released: orderIds.length, expired };
}
