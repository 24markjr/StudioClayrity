import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Database, Executor } from "../db/create";
import {
  auditLogs,
  couponRedemptions,
  orderEvents,
  orderItems,
  orders,
  payments,
  productVariants,
  refunds,
  shipments,
  stockReservations,
} from "../db/schema";
import { adjustStock, releaseReservations } from "../domain/inventory";
import { assertTransition, canTransition, type OrderStatus } from "../domain/order-status";
import type { PaymentProvider } from "../services/payment";
import { mapCourierStatus, shipmentProgress, type ShippingProvider } from "../services/shipping";

/**
 * Order lifecycle after payment: fulfilment, shipping, tracking, cancellation and refunds.
 * Every change is row-locked, validated against the state machine, and recorded in
 * order_events (and audit_logs for staff actions). Functions return the notifications to
 * send *after* the transaction commits, so an email never goes out for a rolled-back change.
 */

export type Notification =
  | { kind: "shipped" | "out_for_delivery" | "delivered"; orderId: string }
  | { kind: "cancelled"; orderId: string; refundExpected: boolean }
  | { kind: "refund_processed"; orderId: string; refundId: string; amount: number };

export type Actor = { actor: string; note?: string };

export class OrderActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderActionError";
  }
}

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

async function lockOrder(tx: Executor, orderId: string) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!order) throw new OrderActionError("Order not found");
  return order;
}

async function move(tx: Executor, order: { id: string; status: OrderStatus }, to: OrderStatus, who: Actor) {
  assertTransition(order.status, to);
  await tx
    .update(orders)
    .set({ status: to, ...(to === "cancelled" ? { cancelledAt: new Date() } : {}) })
    .where(eq(orders.id, order.id));
  await tx
    .insert(orderEvents)
    .values({ orderId: order.id, fromStatus: order.status, toStatus: to, actor: who.actor, note: who.note });
  if (isUuid(who.actor)) {
    await tx.insert(auditLogs).values({
      actorId: who.actor,
      action: "order.status",
      entity: "order",
      entityId: order.id,
      diff: { from: order.status, to, note: who.note ?? null },
    });
  }
  order.status = to;
}

const statusNotification = (orderId: string, to: OrderStatus): Notification | null =>
  to === "shipped" || to === "out_for_delivery" || to === "delivered" ? { kind: to, orderId } : null;

/** Move an order to a new status (admin actions such as processing → packed). */
export async function transitionOrder(db: Database, orderId: string, to: OrderStatus, who: Actor) {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    const from = order.status;
    await move(tx, order, to, who);
    const n = statusNotification(order.id, to);
    return { from, to, notifications: n ? [n] : [] };
  });
}

/** Walk forward through the fulfilment states up to `target`, logging each step. */
async function advanceTo(
  tx: Executor,
  order: { id: string; status: OrderStatus },
  target: OrderStatus,
  who: Actor,
) {
  const path: OrderStatus[] = ["processing", "packed", "shipped", "out_for_delivery", "delivered"];
  const targetIndex = path.indexOf(target);
  while (order.status !== target) {
    const current = path.indexOf(order.status); // -1 for paid / confirmed_cod
    if (current >= targetIndex) break;
    const next = path[current + 1];
    if (!canTransition(order.status, next)) break;
    await move(tx, order, next, who);
  }
  if (order.status !== target) {
    throw new OrderActionError(
      `This order can't be marked ${target.replace(/_/g, " ")} from "${order.status}".`,
    );
  }
}

export type ShipmentInput = {
  carrier: string;
  awb: string;
  trackingUrl?: string | null;
  providerShipmentId?: string | null;
  labelUrl?: string | null;
  isInsured?: boolean;
};

/** Record a shipment (entered by hand or booked with Shiprocket) and mark the order shipped. */
export async function recordShipment(db: Database, orderId: string, input: ShipmentInput, who: Actor) {
  const carrier = input.carrier.trim();
  const awb = input.awb.trim();
  if (!carrier || !awb) throw new OrderActionError("Enter the courier and the tracking (AWB) number.");
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    const [duplicate] = await tx
      .select({ id: shipments.id })
      .from(shipments)
      .where(and(eq(shipments.carrier, carrier), eq(shipments.awb, awb)));
    if (duplicate) throw new OrderActionError("That tracking number is already recorded.");
    await advanceTo(tx, order, "shipped", who);
    const [shipment] = await tx
      .insert(shipments)
      .values({
        orderId,
        carrier,
        awb,
        trackingUrl: input.trackingUrl ?? null,
        providerShipmentId: input.providerShipmentId ?? null,
        labelUrl: input.labelUrl ?? null,
        isInsured: input.isInsured ?? false,
        status: "label_created",
        shippedAt: new Date(),
      })
      .returning();
    return {
      shipment,
      notifications: [{ kind: "shipped", orderId } satisfies Notification] as Notification[],
    };
  });
}

/** Book the courier through Shiprocket (weights and sizes from the packed variant data). */
export async function bookShipment(
  db: Database,
  shipping: ShippingProvider,
  orderId: string,
  who: Actor & { isInsured?: boolean },
) {
  if (shipping.name !== "shiprocket") {
    throw new OrderActionError("Automatic booking isn't set up. Enter the courier and AWB manually.");
  }
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new OrderActionError("Order not found");
  if (!["paid", "confirmed_cod", "processing", "packed"].includes(order.status)) {
    throw new OrderActionError("Only paid or confirmed orders can be shipped.");
  }
  const lines = await db
    .select({
      name: orderItems.productName,
      sku: orderItems.sku,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      weightG: productVariants.packedWeightG,
      fallbackWeightG: productVariants.weightG,
      length: productVariants.packedLengthMm,
      width: productVariants.packedWidthMm,
      height: productVariants.packedHeightMm,
    })
    .from(orderItems)
    .leftJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .where(eq(orderItems.orderId, orderId));

  const weightG = lines.reduce((s, l) => s + (l.weightG ?? l.fallbackWeightG ?? 1000) * l.quantity, 0);
  // One parcel: the largest packed box (the owner can adjust in Shiprocket before pickup)
  const max = (key: "length" | "width" | "height", fallback: number) =>
    Math.max(...lines.map((l) => l[key] ?? fallback));
  const a = order.shippingAddress;

  const created = await shipping.createShipment({
    orderRef: order.publicRef,
    orderDate: order.placedAt,
    customer: {
      name: a.fullName,
      phone: a.phone,
      email: order.email,
      line1: a.line1,
      line2: a.line2,
      city: a.city,
      stateCode: a.stateCode,
      pincode: a.pincode,
    },
    items: lines.map((l) => ({ name: l.name, sku: l.sku, quantity: l.quantity, unitPrice: l.unitPrice })),
    subtotal: order.total,
    weightG,
    dimensionsMm: { length: max("length", 300), width: max("width", 300), height: max("height", 150) },
    cod: order.paymentMethod === "cod",
  });

  return recordShipment(
    db,
    orderId,
    {
      carrier: created.carrier,
      awb: created.awb,
      trackingUrl: created.trackingUrl,
      providerShipmentId: created.providerShipmentId,
      labelUrl: created.labelUrl,
      isInsured: who.isInsured,
    },
    who,
  );
}

/**
 * A courier status update (Shiprocket webhook). Only ever moves a shipment forward;
 * repeated or out-of-order updates are ignored.
 */
export async function applyTrackingUpdate(db: Database, update: { awb: string; status: string; at?: Date }) {
  const state = mapCourierStatus(update.status);
  if (!state)
    return {
      applied: false as const,
      reason: `Unrecognised status "${update.status}"`,
      notifications: [] as Notification[],
    };

  return db.transaction(async (tx) => {
    const [shipment] = await tx
      .select()
      .from(shipments)
      .where(eq(shipments.awb, update.awb.trim()))
      .for("update");
    if (!shipment)
      return { applied: false as const, reason: "Unknown AWB", notifications: [] as Notification[] };
    if (shipmentProgress[state] <= shipmentProgress[shipment.status]) {
      return {
        applied: false as const,
        reason: "Not newer than the current status",
        notifications: [] as Notification[],
      };
    }
    const at = update.at ?? new Date();
    await tx
      .update(shipments)
      .set({ status: state, ...(state === "delivered" ? { deliveredAt: at } : {}) })
      .where(eq(shipments.id, shipment.id));

    const order = await lockOrder(tx, shipment.orderId);
    const who: Actor = { actor: "webhook:courier", note: update.status };
    const notifications: Notification[] = [];
    if (state === "out_for_delivery" && canTransition(order.status, "out_for_delivery")) {
      await move(tx, order, "out_for_delivery", who);
      notifications.push({ kind: "out_for_delivery", orderId: order.id });
    }
    if (state === "delivered" && canTransition(order.status, "delivered")) {
      await move(tx, order, "delivered", who);
      notifications.push({ kind: "delivered", orderId: order.id });
    }
    if (state === "returned" && canTransition(order.status, "returned")) {
      // Returned to the studio (RTO). Stock goes back only after the owner inspects the piece.
      await move(tx, order, "returned", { ...who, note: `${update.status} — inspect before restocking` });
    }
    return { applied: true as const, state, notifications };
  });
}

/**
 * Cancel an order before it ships: stock goes back on the shelf, the coupon use is
 * released, and a paid order moves to refund_pending (refund it with refundOrder).
 */
export async function cancelOrder(db: Database, orderId: string, who: Actor & { reason: string }) {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    const cancellable: OrderStatus[] = [
      "pending_payment",
      "payment_failed",
      "paid",
      "confirmed_cod",
      "processing",
      "packed",
      "cancel_requested",
    ];
    if (!cancellable.includes(order.status)) {
      throw new OrderActionError(
        order.status === "shipped" || order.status === "out_for_delivery"
          ? "This order has already shipped. Record a return instead."
          : `An order that is "${order.status}" can't be cancelled.`,
      );
    }

    // Unpaid: just release any hold. Paid/confirmed: stock was taken, so put it back.
    await releaseReservations(tx, order.id);
    const stockTaken = !["pending_payment", "payment_failed"].includes(order.status);
    if (stockTaken) {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      for (const item of items) {
        if (!item.variantId) continue;
        const [variant] = await tx
          .select({ track: productVariants.trackInventory })
          .from(productVariants)
          .where(eq(productVariants.id, item.variantId));
        if (!variant?.track) continue;
        await adjustStock(tx, {
          variantId: item.variantId,
          delta: item.quantity,
          reason: "correction",
          reference: order.publicRef,
          note: "Order cancelled",
          actorId: isUuid(who.actor) ? who.actor : null,
        });
      }
    }
    await tx.delete(couponRedemptions).where(eq(couponRedemptions.orderId, order.id));

    const [captured] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.orderId, order.id), eq(payments.status, "captured")));
    await move(tx, order, "cancelled", { actor: who.actor, note: who.reason });
    if (captured)
      await move(tx, order, "refund_pending", { actor: "system", note: "Paid online — refund due" });

    return {
      notifications: [
        { kind: "cancelled", orderId: order.id, refundExpected: Boolean(captured) } satisfies Notification,
      ] as Notification[],
    };
  });
}

async function refundedSoFar(tx: Executor, paymentId: string) {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${refunds.amount}), 0)::int` })
    .from(refunds)
    .where(and(eq(refunds.paymentId, paymentId), ne(refunds.status, "failed")));
  return row.total;
}

/** After a refund settles: payment status, and a full refund closes the order. */
async function settleRefund(tx: Executor, refund: typeof refunds.$inferSelect): Promise<Notification[]> {
  if (!refund.paymentId || refund.status !== "processed") return [];
  const [payment] = await tx.select().from(payments).where(eq(payments.id, refund.paymentId));
  const processed = await tx
    .select({ total: sql<number>`coalesce(sum(${refunds.amount}), 0)::int` })
    .from(refunds)
    .where(and(eq(refunds.paymentId, refund.paymentId), eq(refunds.status, "processed")));
  const full = processed[0].total >= payment.amount;
  await tx
    .update(payments)
    .set({ status: full ? "refunded" : "partially_refunded" })
    .where(eq(payments.id, payment.id));
  const order = await lockOrder(tx, refund.orderId);
  if (full && order.status === "refund_pending")
    await move(tx, order, "refunded", { actor: "system", note: "Refund settled" });
  return [{ kind: "refund_processed", orderId: refund.orderId, refundId: refund.id, amount: refund.amount }];
}

/**
 * Refund through Razorpay. A full refund needs the order cancelled or returned first
 * (refund_pending); partial refunds (e.g. one broken piece) can be made on any paid order.
 * A refund only counts as processed when Razorpay says so — never on our say-so.
 */
export async function refundOrder(
  db: Database,
  provider: PaymentProvider,
  orderId: string,
  input: { amount?: number; reason: string } & Actor,
) {
  // Reserve the amount in our database first, so two clicks can't refund twice
  const pending = await db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    const [payment] = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.orderId, orderId),
          eq(payments.provider, "razorpay"),
          inArray(payments.status, ["captured", "partially_refunded"]),
        ),
      )
      .for("update");
    if (!payment?.providerPaymentId) {
      throw new OrderActionError(
        order.paymentMethod === "cod"
          ? "Cash-on-delivery orders are refunded by bank transfer — record it as a manual refund."
          : "There's no captured online payment to refund.",
      );
    }
    const refundable = payment.amount - (await refundedSoFar(tx, payment.id));
    const amount = input.amount ?? refundable;
    if (!Number.isSafeInteger(amount) || amount <= 0)
      throw new OrderActionError("Enter an amount to refund.");
    if (amount > refundable) throw new OrderActionError(`At most ${refundable} paise can still be refunded.`);
    // A full refund closes the order, so it must already be cancelled or returned — that
    // path puts the stock back. Refunding a live order in full would lose the piece.
    if (amount === refundable && order.status !== "refund_pending") {
      throw new OrderActionError("Cancel the order (or record the return) before refunding it in full.");
    }
    const [refund] = await tx
      .insert(refunds)
      .values({
        orderId,
        paymentId: payment.id,
        amount,
        reason: input.reason,
        status: "pending",
        initiatedBy: isUuid(input.actor) ? input.actor : null,
      })
      .returning();
    return { refund, providerPaymentId: payment.providerPaymentId };
  });

  try {
    const result = await provider.refund({
      paymentId: pending.providerPaymentId,
      amount: pending.refund.amount,
      notes: { order_id: orderId, reason: input.reason.slice(0, 200) },
    });
    return db.transaction(async (tx) => {
      const status = result.status === "processed" ? "processed" : "pending";
      const [refund] = await tx
        .update(refunds)
        .set({ providerRefundId: result.id, status })
        .where(eq(refunds.id, pending.refund.id))
        .returning();
      return { refund, notifications: await settleRefund(tx, refund) };
    });
  } catch (error) {
    await db.update(refunds).set({ status: "failed" }).where(eq(refunds.id, pending.refund.id));
    throw error;
  }
}

/** Razorpay refund webhook (refund.processed / refund.failed). Idempotent. */
export async function applyRefundUpdate(
  db: Database,
  update: { providerRefundId: string; status: "processed" | "failed" },
) {
  return db.transaction(async (tx) => {
    const [refund] = await tx
      .select()
      .from(refunds)
      .where(eq(refunds.providerRefundId, update.providerRefundId))
      .for("update");
    if (!refund || refund.status === update.status || refund.status === "processed")
      return [] as Notification[];
    const [updated] = await tx
      .update(refunds)
      .set({ status: update.status })
      .where(eq(refunds.id, refund.id))
      .returning();
    return settleRefund(tx, updated);
  });
}

/** Cash-on-delivery or other off-platform refunds, recorded with a reference. */
export async function recordManualRefund(
  db: Database,
  orderId: string,
  input: { amount: number; reference: string } & Actor,
) {
  if (!input.reference.trim()) throw new OrderActionError("Add the bank transfer reference.");
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > order.total) {
      throw new OrderActionError("Enter an amount up to the order total.");
    }
    const [refund] = await tx
      .insert(refunds)
      .values({
        orderId,
        amount: input.amount,
        reason: `Manual refund · ${input.reference.trim()}`,
        status: "processed",
        initiatedBy: isUuid(input.actor) ? input.actor : null,
      })
      .returning();
    if (order.status === "refund_pending" && input.amount >= order.total) {
      await move(tx, order, "refunded", { actor: input.actor, note: input.reference });
    }
    return {
      refund,
      notifications: [
        {
          kind: "refund_processed",
          orderId,
          refundId: refund.id,
          amount: refund.amount,
        } satisfies Notification,
      ] as Notification[],
    };
  });
}

/** Most recent shipment for an order (emails, tracking page). */
export async function latestShipment(db: Executor, orderId: string) {
  const [row] = await db
    .select()
    .from(shipments)
    .where(eq(shipments.orderId, orderId))
    .orderBy(desc(shipments.createdAt))
    .limit(1);
  return row ?? null;
}

/** Holds still active for an order — used by tests and the admin. */
export async function activeHolds(db: Executor, orderId: string) {
  return db
    .select()
    .from(stockReservations)
    .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "active")));
}
