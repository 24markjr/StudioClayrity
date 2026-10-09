import { createHmac, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seed } from "../../scripts/seed";
import { addItem, applyCoupon, getOrCreateCart, loadBag } from "../../src/lib/cart/service";
import type { CheckoutData, CheckoutInput } from "../../src/lib/checkout/schema";
import { checkoutSchema } from "../../src/lib/checkout/schema";
import {
  confirmClientPayment,
  expireStaleOrders,
  handleRazorpayWebhook,
  placeOrder,
  retryPayment,
  type CheckoutDeps,
} from "../../src/lib/checkout/service";
import {
  couponRedemptions,
  coupons,
  inventory,
  inventoryAdjustments,
  orderEvents,
  orderItems,
  orders,
  payments,
  productVariants,
  stockReservations,
  webhookEvents,
} from "../../src/lib/db/schema";
import { generateToken, hashToken } from "../../src/lib/domain/identifiers";
import { setSetting } from "../../src/lib/domain/settings";
import { RazorpayProvider } from "../../src/lib/services/payment";
import { openTestDb } from "./helpers";

const { db } = openTestDb(20);

const KEY_SECRET = "test_key_secret";
const WEBHOOK_SECRET = "test_webhook_secret";

/**
 * Stands in for Razorpay's servers only. Everything else — request building, signature
 * verification, our state machine — is the real code.
 */
class FakeRazorpayApi {
  orders = new Map<string, { amount: number; receipt: string }>();
  payments = new Map<
    string,
    { id: string; order_id: string; amount: number; status: string; method: string }
  >();
  failCreate = false;
  private n = 0;

  fetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/v1/orders") && init?.method === "POST") {
      if (this.failCreate) return new Response('{"error":{"description":"down"}}', { status: 503 });
      const body = JSON.parse(String(init.body));
      const id = `order_T${++this.n}${Date.now()}`;
      this.orders.set(id, { amount: body.amount, receipt: body.receipt });
      return Response.json({
        id,
        amount: body.amount,
        currency: "INR",
        receipt: body.receipt,
        status: "created",
      });
    }
    const paymentMatch = url.match(/\/v1\/payments\/([^/]+)$/);
    if (paymentMatch) {
      const p = this.payments.get(decodeURIComponent(paymentMatch[1]));
      return p
        ? Response.json({ ...p, error_code: null, error_description: null })
        : new Response("{}", { status: 404 });
    }
    return new Response("not found", { status: 404 });
  };
}

let api: FakeRazorpayApi;
let deps: CheckoutDeps;
const variantIds: Record<string, string> = {};

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("hex");

function webhook(
  event: "payment.captured" | "payment.failed",
  providerOrderId: string,
  paymentId: string,
  amount: number,
) {
  const body = JSON.stringify({
    entity: "event",
    event,
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: providerOrderId,
          amount,
          status: event === "payment.captured" ? "captured" : "failed",
          method: "upi",
          error_code: event === "payment.failed" ? "BAD_REQUEST_ERROR" : null,
          error_description: event === "payment.failed" ? "Payment declined" : null,
        },
      },
    },
  });
  return { rawBody: body, signature: sign(body, WEBHOOK_SECRET), eventId: `evt_${randomUUID()}` };
}

const address = {
  fullName: "Ananya Rao",
  phone: "9876543210",
  line1: "12 Lavelle Road",
  city: "Bengaluru",
  stateCode: "29",
  pincode: "560001",
};

function input(overrides: Partial<CheckoutInput> = {}): CheckoutData {
  return checkoutSchema.parse({
    email: "ananya@example.com",
    shipping: address,
    billingSameAsShipping: true,
    shippingMethod: "standard",
    paymentMethod: "razorpay",
    idempotencyKey: randomUUID(),
    ...overrides,
  });
}

async function bagWith(...lines: Array<[sku: string, quantity: number]>) {
  const tokenHash = hashToken(generateToken());
  const cart = await getOrCreateCart(db, tokenHash);
  for (const [sku, qty] of lines) await addItem(db, cart.id, variantIds[sku], qty);
  return { cart, tokenHash };
}

async function stock(sku: string) {
  const [row] = await db.select().from(inventory).where(eq(inventory.variantId, variantIds[sku]));
  return { onHand: row.onHand, reserved: row.reserved };
}

async function orderByRef(ref: string) {
  const [o] = await db.select().from(orders).where(eq(orders.publicRef, ref));
  return o;
}

async function providerOrderIdFor(ref: string) {
  const o = await orderByRef(ref);
  const [p] = await db.select().from(payments).where(eq(payments.orderId, o.id));
  return p.providerOrderId!;
}

beforeAll(async () => {
  await seed(db, { appEnv: "test" });
  for (const v of await db
    .select({ id: productVariants.id, sku: productVariants.sku })
    .from(productVariants)) {
    variantIds[v.sku] = v.id;
  }
});

beforeEach(async () => {
  await db.delete(webhookEvents);
  await db.delete(payments);
  await db.delete(orders);
  await db.update(inventory).set({ reserved: 0 });
  await db
    .update(inventory)
    .set({ onHand: 4 })
    .where(eq(inventory.variantId, variantIds["SAMPLE-TRAY-001-L"]));
  await db.update(inventory).set({ onHand: 1 }).where(eq(inventory.variantId, variantIds["SAMPLE-BOWL-001"]));
  await db.update(coupons).set({ perCustomerLimit: null });
  await setSetting(db, "shipping", {
    ratesConfirmed: true,
    flatRate: 50_000,
    freeAbove: 1_500_000,
    expressRate: 120_000,
    chargesGstRateBp: 1800,
  });
  await setSetting(db, "cod", { enabled: false, maxOrderTotal: 2_000_000, fee: 5_000 });
  await setSetting(db, "seller", {
    legalName: "Studio Clayrity",
    gstin: "",
    stateCode: "29",
    address: "",
    isConfirmed: true,
  });
  await setSetting(db, "checkout", { reservationMinutes: 15 });

  api = new FakeRazorpayApi();
  deps = {
    payment: new RazorpayProvider("rzp_test_key", KEY_SECRET, WEBHOOK_SECRET, api.fetch),
    paymentsConfigured: true,
    appEnv: "test",
  };
});

describe("readiness", () => {
  it("doesn't open checkout before shipping rates are confirmed", async () => {
    await setSetting(db, "shipping", {
      ratesConfirmed: false,
      flatRate: 0,
      freeAbove: null,
      expressRate: null,
      chargesGstRateBp: 1800,
    });
    const { tokenHash } = await bagWith(["SAMPLE-DISH-001", 1]);
    expect(await placeOrder(db, deps, { cartTokenHash: tokenHash, input: input() })).toEqual({
      kind: "error",
      message: "Shipping rates are still being finalised, so checkout isn't open yet.",
    });
  });

  it("explains when no payment method is set up", async () => {
    const { tokenHash } = await bagWith(["SAMPLE-DISH-001", 1]);
    const result = await placeOrder(
      db,
      { ...deps, paymentsConfigured: false },
      { cartTokenHash: tokenHash, input: input() },
    );
    expect(result).toEqual({
      kind: "error",
      message: "Online payments aren't set up yet, so checkout isn't open.",
    });
  });

  it("requires confirmed seller tax details in production", async () => {
    await setSetting(db, "seller", {
      legalName: "x",
      gstin: "",
      stateCode: "29",
      address: "",
      isConfirmed: false,
    });
    const { tokenHash } = await bagWith(["SAMPLE-DISH-001", 1]);
    const result = await placeOrder(
      db,
      { ...deps, appEnv: "production" },
      { cartTokenHash: tokenHash, input: input() },
    );
    expect(result).toMatchObject({ kind: "error", message: expect.stringContaining("tax details") });
  });
});

describe("placing an order", () => {
  it("prices on the server, snapshots lines, holds stock and opens a Razorpay order", async () => {
    const { tokenHash } = await bagWith(["SAMPLE-TRAY-001-L", 1]);
    const result = await placeOrder(db, deps, {
      cartTokenHash: tokenHash,
      input: input({ shipping: { ...address, stateCode: "27", city: "Mumbai", pincode: "400001" } }),
    });
    expect(result).toMatchObject({ kind: "razorpay", keyId: "rzp_test_key", amount: 900_000 });
    if (result.kind !== "razorpay") throw new Error();

    const order = await orderByRef(result.orderRef);
    // ₹8,500 + ₹500 shipping, shipped to Maharashtra from Karnataka → IGST only
    expect(order).toMatchObject({
      status: "pending_payment",
      subtotal: 850_000,
      shippingTotal: 50_000,
      total: 900_000,
      cgst: 0,
      sgst: 0,
      isTest: true,
    });
    expect(order.igst).toBe(order.taxTotal);
    expect(order.taxTotal).toBe(Math.round((850_000 * 1800) / 11800) + Math.round((50_000 * 1800) / 11800));

    const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(item).toMatchObject({
      productName: "Travertine Tray",
      variantName: "Large",
      sku: "SAMPLE-TRAY-001-L",
      unitPrice: 850_000,
      quantity: 1,
      gstRateBp: 1800,
    });

    expect(await stock("SAMPLE-TRAY-001-L")).toEqual({ onHand: 4, reserved: 1 });
    expect(api.orders.get(result.providerOrderId)).toEqual({ amount: 900_000, receipt: result.orderRef });
  });

  it("splits GST into CGST and SGST within the seller's state", async () => {
    const { tokenHash } = await bagWith(["SAMPLE-TRAY-001-L", 1]);
    const result = await placeOrder(db, deps, { cartTokenHash: tokenHash, input: input() });
    if (result.kind !== "razorpay") throw new Error(JSON.stringify(result));
    const order = await orderByRef(result.orderRef);
    expect(order.igst).toBe(0);
    expect(order.cgst + order.sgst).toBe(order.taxTotal);
  });

  it("stops when the total the shopper saw has changed", async () => {
    const { tokenHash } = await bagWith(["SAMPLE-TRAY-001-L", 1]);
    const result = await placeOrder(db, deps, {
      cartTokenHash: tokenHash,
      input: input({ expectedTotal: 100 }),
    });
    expect(result).toMatchObject({ kind: "changed", quote: { total: 900_000 } });
    expect(await db.select().from(orders)).toEqual([]);
  });

  it("creates one order however many times the same submission arrives", async () => {
    const { tokenHash } = await bagWith(["SAMPLE-TRAY-001-L", 1]);
    const same = input();
    const results = await Promise.all(
      [1, 2, 3].map(() => placeOrder(db, deps, { cartTokenHash: tokenHash, input: same })),
    );
    expect(results.filter((r) => r.kind === "razorpay")).toHaveLength(1);
    expect(await db.select().from(orders)).toHaveLength(1);
    expect(await stock("SAMPLE-TRAY-001-L")).toMatchObject({ reserved: 1 });
  });

  it("sells a one-of-a-kind piece to exactly one of two simultaneous buyers", async () => {
    const a = await bagWith(["SAMPLE-BOWL-001", 1]);
    const b = await bagWith(["SAMPLE-BOWL-001", 1]);
    const results = await Promise.all([
      placeOrder(db, deps, { cartTokenHash: a.tokenHash, input: input() }),
      placeOrder(db, deps, { cartTokenHash: b.tokenHash, input: input({ email: "other@example.com" }) }),
    ]);
    expect(results.filter((r) => r.kind === "razorpay")).toHaveLength(1);
    expect(results.find((r) => r.kind === "error")).toMatchObject({
      message: expect.stringContaining("just been reserved"),
    });
  });

  it("refuses an empty bag", async () => {
    expect(await placeOrder(db, deps, { cartTokenHash: hashToken("nope"), input: input() })).toEqual({
      kind: "error",
      message: "Your bag is empty.",
    });
  });

  it("gives the stock back if Razorpay can't create the payment", async () => {
    api.failCreate = true;
    const { tokenHash } = await bagWith(["SAMPLE-TRAY-001-L", 1]);
    const result = await placeOrder(db, deps, { cartTokenHash: tokenHash, input: input() });
    expect(result).toEqual({
      kind: "error",
      message: "We couldn't start the payment. Please try again in a moment.",
    });
    expect(await stock("SAMPLE-TRAY-001-L")).toEqual({ onHand: 4, reserved: 0 });
    const [order] = await db.select().from(orders);
    expect(order.status).toBe("cancelled");
  });
});

describe("payment confirmation", () => {
  async function placed(sku = "SAMPLE-TRAY-001-L", extra: Partial<CheckoutInput> = {}) {
    const bag = await bagWith([sku, 1]);
    const result = await placeOrder(db, deps, { cartTokenHash: bag.tokenHash, input: input(extra) });
    if (result.kind !== "razorpay") throw new Error(JSON.stringify(result));
    return { ...result, ...bag };
  }

  it("marks the order paid from a signed webhook: stock leaves, invoice issued, bag emptied", async () => {
    const p = await placed();
    const outcome = await handleRazorpayWebhook(
      db,
      deps.payment,
      webhook("payment.captured", p.providerOrderId, "pay_1", p.amount),
    );
    expect(outcome).toMatchObject({ status: 200, outcome: { kind: "paid", slugs: ["travertine-tray"] } });

    const order = await orderByRef(p.orderRef);
    expect(order.status).toBe("paid");
    expect(order.paidAt).not.toBeNull();
    expect(order.invoiceNumber).toMatch(/^SC\/\d{2}-\d{2}\/\d{4,}$/);
    expect(await stock("SAMPLE-TRAY-001-L")).toEqual({ onHand: 3, reserved: 0 });
    expect(
      (
        await loadBag(db, p.tokenHash, {
          shipping: {
            ratesConfirmed: true,
            flatRate: 0,
            freeAbove: null,
            expressRate: null,
            chargesGstRateBp: 1800,
          },
          gifting: { wrapEnabled: false, wrapPrice: 0 },
        })
      ).lines,
    ).toEqual([]);
    const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id));
    expect(payment).toMatchObject({ status: "captured", providerPaymentId: "pay_1", method: "upi" });
  });

  it("processes a webhook delivered five times exactly once", async () => {
    const p = await placed();
    const delivery = webhook("payment.captured", p.providerOrderId, "pay_dup", p.amount);
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(() => handleRazorpayWebhook(db, deps.payment, delivery)),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    const order = await orderByRef(p.orderRef);
    const sales = await db
      .select()
      .from(inventoryAdjustments)
      .where(eq(inventoryAdjustments.reference, p.orderRef));
    expect(sales).toHaveLength(1);
    const paidEvents = await db
      .select()
      .from(orderEvents)
      .where(and(eq(orderEvents.orderId, order.id), eq(orderEvents.toStatus, "paid")));
    expect(paidEvents).toHaveLength(1);
    expect(await stock("SAMPLE-TRAY-001-L")).toEqual({ onHand: 3, reserved: 0 });
  });

  it("rejects webhooks with a bad signature", async () => {
    const p = await placed();
    const delivery = webhook("payment.captured", p.providerOrderId, "pay_x", p.amount);
    expect(
      await handleRazorpayWebhook(db, deps.payment, {
        ...delivery,
        signature: sign(delivery.rawBody, "wrong"),
      }),
    ).toEqual({ status: 401 });
    expect(await handleRazorpayWebhook(db, deps.payment, { ...delivery, signature: null })).toEqual({
      status: 401,
    });
    expect((await orderByRef(p.orderRef)).status).toBe("pending_payment");
  });

  it("confirms from the browser only after Razorpay says the payment is captured", async () => {
    const p = await placed();
    api.payments.set("pay_c", {
      id: "pay_c",
      order_id: p.providerOrderId,
      amount: p.amount,
      status: "authorized",
      method: "card",
    });
    const signature = sign(`${p.providerOrderId}|pay_c`, KEY_SECRET);

    expect(
      await confirmClientPayment(db, deps.payment, {
        providerOrderId: p.providerOrderId,
        providerPaymentId: "pay_c",
        signature: "deadbeef",
      }),
    ).toEqual({ kind: "invalid" });
    expect(
      await confirmClientPayment(db, deps.payment, {
        providerOrderId: p.providerOrderId,
        providerPaymentId: "pay_c",
        signature,
      }),
    ).toMatchObject({ kind: "pending" });
    expect((await orderByRef(p.orderRef)).status).toBe("pending_payment");

    api.payments.get("pay_c")!.status = "captured";
    expect(
      await confirmClientPayment(db, deps.payment, {
        providerOrderId: p.providerOrderId,
        providerPaymentId: "pay_c",
        signature,
      }),
    ).toMatchObject({ kind: "paid" });
    // The webhook arriving afterwards changes nothing
    const later = await handleRazorpayWebhook(
      db,
      deps.payment,
      webhook("payment.captured", p.providerOrderId, "pay_c", p.amount),
    );
    expect(later.outcome).toMatchObject({ kind: "paid", alreadyProcessed: true });
  });

  it("rejects a valid signature for a payment that belongs to another order", async () => {
    const p = await placed();
    api.payments.set("pay_other", {
      id: "pay_other",
      order_id: "order_someone_else",
      amount: p.amount,
      status: "captured",
      method: "card",
    });
    const signature = sign(`${p.providerOrderId}|pay_other`, KEY_SECRET);
    expect(
      await confirmClientPayment(db, deps.payment, {
        providerOrderId: p.providerOrderId,
        providerPaymentId: "pay_other",
        signature,
      }),
    ).toEqual({ kind: "invalid" });
  });

  it("releases stock on failure and lets the customer retry", async () => {
    const p = await placed();
    await handleRazorpayWebhook(
      db,
      deps.payment,
      webhook("payment.failed", p.providerOrderId, "pay_f", p.amount),
    );
    expect((await orderByRef(p.orderRef)).status).toBe("payment_failed");
    expect(await stock("SAMPLE-TRAY-001-L")).toEqual({ onHand: 4, reserved: 0 });

    const retry = await retryPayment(db, deps, { orderRef: p.orderRef, accessToken: p.accessToken });
    expect(retry).toMatchObject({ kind: "razorpay", providerOrderId: p.providerOrderId });
    expect((await orderByRef(p.orderRef)).status).toBe("pending_payment");
    expect(await stock("SAMPLE-TRAY-001-L")).toEqual({ onHand: 4, reserved: 1 });

    await handleRazorpayWebhook(
      db,
      deps.payment,
      webhook("payment.captured", p.providerOrderId, "pay_ok", p.amount),
    );
    expect((await orderByRef(p.orderRef)).status).toBe("paid");
  });

  it("refuses a retry with the wrong link token", async () => {
    const p = await placed();
    expect(await retryPayment(db, deps, { orderRef: p.orderRef, accessToken: "wrong" })).toEqual({
      kind: "error",
      message: "We couldn't find that order.",
    });
  });
});

describe("expired holds and late payments", () => {
  it("expires unpaid orders and returns their stock", async () => {
    const bag = await bagWith(["SAMPLE-TRAY-001-L", 2]);
    const placedOrder = await placeOrder(db, deps, { cartTokenHash: bag.tokenHash, input: input() });
    if (placedOrder.kind !== "razorpay") throw new Error();
    expect(await expireStaleOrders(db, new Date())).toEqual({ released: 0, expired: 0 });
    expect(await expireStaleOrders(db, new Date(Date.now() + 16 * 60_000))).toEqual({
      released: 1,
      expired: 1,
    });
    expect((await orderByRef(placedOrder.orderRef)).status).toBe("expired");
    expect(await stock("SAMPLE-TRAY-001-L")).toEqual({ onHand: 4, reserved: 0 });
  });

  it("still fulfils a late payment if the stock is there", async () => {
    const bag = await bagWith(["SAMPLE-TRAY-001-L", 1]);
    const p = await placeOrder(db, deps, { cartTokenHash: bag.tokenHash, input: input() });
    if (p.kind !== "razorpay") throw new Error();
    await expireStaleOrders(db, new Date(Date.now() + 16 * 60_000));
    const result = await handleRazorpayWebhook(
      db,
      deps.payment,
      webhook("payment.captured", p.providerOrderId, "pay_late", p.amount),
    );
    expect(result.outcome).toMatchObject({ kind: "paid" });
    expect(await stock("SAMPLE-TRAY-001-L")).toEqual({ onHand: 3, reserved: 0 });
  });

  it("flags a late payment for refund when the piece has sold to someone else", async () => {
    const first = await bagWith(["SAMPLE-BOWL-001", 1]);
    const p = await placeOrder(db, deps, { cartTokenHash: first.tokenHash, input: input() });
    if (p.kind !== "razorpay") throw new Error();
    await expireStaleOrders(db, new Date(Date.now() + 16 * 60_000));

    const second = await bagWith(["SAMPLE-BOWL-001", 1]);
    const q = await placeOrder(db, deps, {
      cartTokenHash: second.tokenHash,
      input: input({ email: "b@example.com" }),
    });
    if (q.kind !== "razorpay") throw new Error();
    await handleRazorpayWebhook(
      db,
      deps.payment,
      webhook("payment.captured", q.providerOrderId, "pay_b", q.amount),
    );

    const late = await handleRazorpayWebhook(
      db,
      deps.payment,
      webhook("payment.captured", p.providerOrderId, "pay_a", p.amount),
    );
    expect(late.outcome).toMatchObject({ kind: "refund_required" });
    const order = await orderByRef(p.orderRef);
    expect(order.status).toBe("refund_pending");
    expect(order.internalNote).toContain("Refund");
    expect(await stock("SAMPLE-BOWL-001")).toEqual({ onHand: 0, reserved: 0 });
  });
});

describe("cash on delivery", () => {
  beforeEach(async () => {
    await setSetting(db, "cod", { enabled: true, maxOrderTotal: 2_000_000, fee: 5_000 });
  });

  it("confirms immediately, adds the fee and takes the stock", async () => {
    const { tokenHash } = await bagWith(["SAMPLE-TRAY-001-L", 1]);
    const result = await placeOrder(db, deps, {
      cartTokenHash: tokenHash,
      input: input({ paymentMethod: "cod" }),
    });
    expect(result).toMatchObject({ kind: "confirmed" });
    if (result.kind !== "confirmed") throw new Error();
    const order = await orderByRef(result.orderRef);
    expect(order).toMatchObject({
      status: "confirmed_cod",
      paymentMethod: "cod",
      codFee: 5_000,
      total: 905_000,
    });
    expect(order.invoiceNumber).not.toBeNull();
    expect(await stock("SAMPLE-TRAY-001-L")).toEqual({ onHand: 3, reserved: 0 });
    expect(api.orders.size).toBe(0);
  });

  it("is refused above the configured order value", async () => {
    const { tokenHash } = await bagWith(["SAMPLE-TRAY-001-L", 3]);
    const result = await placeOrder(db, deps, {
      cartTokenHash: tokenHash,
      input: input({ paymentMethod: "cod" }),
    });
    expect(result).toEqual({
      kind: "error",
      message: "Cash on delivery isn't available for orders of this value.",
    });
  });

  it("works without online payments configured", async () => {
    const { tokenHash } = await bagWith(["SAMPLE-DISH-001", 1]);
    const result = await placeOrder(
      db,
      { ...deps, paymentsConfigured: false },
      { cartTokenHash: tokenHash, input: input({ paymentMethod: "cod" }) },
    );
    expect(result.kind).toBe("confirmed");
    const online = await placeOrder(
      db,
      { ...deps, paymentsConfigured: false },
      { cartTokenHash: tokenHash, input: input() },
    );
    expect(online).toMatchObject({ kind: "error" });
  });
});

describe("coupons at checkout", () => {
  it("records the redemption once paid and enforces per-customer limits by email", async () => {
    await db.update(coupons).set({ perCustomerLimit: 1 }).where(eq(coupons.code, "SAMPLE10"));
    const first = await bagWith(["SAMPLE-TRAY-001-L", 1]);
    await applyCoupon(db, first.cart.id, "SAMPLE10", {
      shipping: {
        ratesConfirmed: true,
        flatRate: 50_000,
        freeAbove: null,
        expressRate: null,
        chargesGstRateBp: 1800,
      },
      gifting: { wrapEnabled: false, wrapPrice: 0 },
    });
    const p = await placeOrder(db, deps, { cartTokenHash: first.tokenHash, input: input() });
    if (p.kind !== "razorpay") throw new Error(JSON.stringify(p));
    expect(p.amount).toBe(850_000 - 85_000 + 50_000);
    await handleRazorpayWebhook(
      db,
      deps.payment,
      webhook("payment.captured", p.providerOrderId, "pay_cp", p.amount),
    );
    const [redemption] = await db.select().from(couponRedemptions);
    expect(redemption).toMatchObject({ email: "ananya@example.com", amount: 85_000 });

    // Same customer, new bag: the code no longer applies — and the order is priced without it
    const second = await bagWith(["SAMPLE-TRAY-001-L", 1]);
    await applyCoupon(db, second.cart.id, "SAMPLE10", {
      shipping: {
        ratesConfirmed: true,
        flatRate: 50_000,
        freeAbove: null,
        expressRate: null,
        chargesGstRateBp: 1800,
      },
      gifting: { wrapEnabled: false, wrapPrice: 0 },
    });
    const changed = await placeOrder(db, deps, {
      cartTokenHash: second.tokenHash,
      input: input({ expectedTotal: 815_000 }),
    });
    expect(changed).toMatchObject({
      kind: "changed",
      quote: { total: 900_000, couponMessage: "You've already used this code." },
    });
  });
});

describe("database invariants", () => {
  it("leaves no active holds after paid, failed and expired orders", async () => {
    const a = await bagWith(["SAMPLE-TRAY-001-L", 1]);
    const pa = await placeOrder(db, deps, { cartTokenHash: a.tokenHash, input: input() });
    const b = await bagWith(["SAMPLE-DISH-001", 1]);
    const pb = await placeOrder(db, deps, { cartTokenHash: b.tokenHash, input: input() });
    if (pa.kind !== "razorpay" || pb.kind !== "razorpay") throw new Error();
    await handleRazorpayWebhook(
      db,
      deps.payment,
      webhook("payment.captured", await providerOrderIdFor(pa.orderRef), "p1", pa.amount),
    );
    await handleRazorpayWebhook(
      db,
      deps.payment,
      webhook("payment.failed", await providerOrderIdFor(pb.orderRef), "p2", pb.amount),
    );
    const [{ active }] = await db
      .select({ active: sql<number>`count(*)::int` })
      .from(stockReservations)
      .where(eq(stockReservations.status, "active"));
    expect(active).toBe(0);
    const [{ reserved }] = await db.select({ reserved: sql<number>`sum(reserved)::int` }).from(inventory);
    expect(reserved).toBe(0);
  });
});
