import { createHmac, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seed } from "../../scripts/seed";
import { addItem, applyCoupon, getOrCreateCart } from "../../src/lib/cart/service";
import { checkoutSchema, type CheckoutInput } from "../../src/lib/checkout/schema";
import { handleRazorpayWebhook, placeOrder, type CheckoutDeps } from "../../src/lib/checkout/service";
import {
  backInStockRequests,
  couponRedemptions,
  emailDeliveries,
  inventory,
  orderEvents,
  orders,
  payments,
  productVariants,
  refunds,
  shipments,
  webhookEvents,
} from "../../src/lib/db/schema";
import { generateToken, hashToken } from "../../src/lib/domain/identifiers";
import { setSetting } from "../../src/lib/domain/settings";
import {
  applyTrackingUpdate,
  bookShipment,
  cancelOrder,
  OrderActionError,
  recordManualRefund,
  recordShipment,
  refundOrder,
  transitionOrder,
} from "../../src/lib/orders/lifecycle";
import {
  deliverNotifications,
  lowStockRows,
  notifyBackInStock,
  sendLowStockDigest,
} from "../../src/lib/orders/notify";
import { findOrderForTracking } from "../../src/lib/orders/tracking";
import type { EmailMessage, EmailProvider } from "../../src/lib/services/email";
import { RazorpayProvider } from "../../src/lib/services/payment";
import { ManualShippingProvider, ShiprocketProvider } from "../../src/lib/services/shipping";
import { openTestDb } from "./helpers";

const { db } = openTestDb(20);
const SITE = "https://studioclayrity.test";
const WEBHOOK_SECRET = "whsec_orders";

/** Stand-in for Razorpay's servers: orders and refunds. */
class FakeRazorpay {
  refundStatus: "processed" | "pending" = "processed";
  refunds: Array<{ paymentId: string; amount: number }> = [];
  private n = 0;
  fetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/v1/orders")) {
      const body = JSON.parse(String(init?.body));
      return Response.json({
        id: `order_${++this.n}_${Date.now()}`,
        amount: body.amount,
        currency: "INR",
        receipt: body.receipt,
        status: "created",
      });
    }
    const refund = url.match(/\/v1\/payments\/([^/]+)\/refund$/);
    if (refund) {
      const body = JSON.parse(String(init?.body));
      this.refunds.push({ paymentId: decodeURIComponent(refund[1]), amount: body.amount });
      return Response.json({
        id: `rfnd_${++this.n}`,
        payment_id: refund[1],
        amount: body.amount,
        status: this.refundStatus,
      });
    }
    return new Response("{}", { status: 404 });
  };
}

class RecordingEmail implements EmailProvider {
  readonly name = "recording";
  sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
    return { id: `m${this.sent.length}` };
  }
}

let razorpay: FakeRazorpay;
let deps: CheckoutDeps;
const variantIds: Record<string, string> = {};

const sign = (body: string) => createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
function webhook(event: string, payload: object) {
  const rawBody = JSON.stringify({ entity: "event", event, payload });
  return { rawBody, signature: sign(rawBody), eventId: `evt_${randomUUID()}` };
}

const address = {
  fullName: "Ananya Rao",
  phone: "9876543210",
  line1: "12 Lavelle Road",
  city: "Mumbai",
  stateCode: "27",
  pincode: "400001",
};
const input = (o: Partial<CheckoutInput> = {}) =>
  checkoutSchema.parse({
    email: "ananya@example.com",
    shipping: address,
    billingSameAsShipping: true,
    shippingMethod: "standard",
    paymentMethod: "razorpay",
    idempotencyKey: randomUUID(),
    ...o,
  });

async function stock(sku: string) {
  const [row] = await db.select().from(inventory).where(eq(inventory.variantId, variantIds[sku]));
  return row.onHand;
}

/** A paid online order (or a confirmed COD order). */
async function paidOrder(sku = "SAMPLE-TRAY-001-L", options: { cod?: boolean; coupon?: string } = {}) {
  const tokenHash = hashToken(generateToken());
  const cart = await getOrCreateCart(db, tokenHash);
  await addItem(db, cart.id, variantIds[sku], 1);
  if (options.coupon) {
    await applyCoupon(db, cart.id, options.coupon, {
      shipping: {
        ratesConfirmed: true,
        flatRate: 50_000,
        freeAbove: null,
        expressRate: null,
        chargesGstRateBp: 1800,
      },
      gifting: { wrapEnabled: false, wrapPrice: 0 },
    });
  }
  const result = await placeOrder(db, deps, {
    cartTokenHash: tokenHash,
    input: input(options.cod ? { paymentMethod: "cod" } : {}),
  });
  if (result.kind === "confirmed")
    return (await db.select().from(orders).where(eq(orders.id, result.orderId)))[0];
  if (result.kind !== "razorpay") throw new Error(JSON.stringify(result));
  await handleRazorpayWebhook(
    db,
    deps.payment,
    webhook("payment.captured", {
      payment: {
        entity: {
          id: `pay_${randomUUID().slice(0, 8)}`,
          order_id: result.providerOrderId,
          amount: result.amount,
          status: "captured",
          method: "upi",
        },
      },
    }),
  );
  const [order] = await db.select().from(orders).where(eq(orders.publicRef, result.orderRef));
  expect(order.status).toBe("paid");
  return order;
}

const statusOf = async (id: string) =>
  (await db.select({ s: orders.status }).from(orders).where(eq(orders.id, id)))[0].s;
const admin = { actor: "00000000-0000-4000-8000-000000000001" };

beforeAll(async () => {
  await seed(db, { appEnv: "test" });
  for (const v of await db.select({ id: productVariants.id, sku: productVariants.sku }).from(productVariants))
    variantIds[v.sku] = v.id;
});

beforeEach(async () => {
  await db.delete(webhookEvents);
  await db.delete(refunds);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(emailDeliveries);
  await db.delete(backInStockRequests);
  await db.update(inventory).set({ reserved: 0 });
  await db
    .update(inventory)
    .set({ onHand: 4 })
    .where(eq(inventory.variantId, variantIds["SAMPLE-TRAY-001-L"]));
  await setSetting(db, "shipping", {
    ratesConfirmed: true,
    flatRate: 50_000,
    freeAbove: null,
    expressRate: null,
    chargesGstRateBp: 1800,
  });
  await setSetting(db, "cod", { enabled: true, maxOrderTotal: 5_000_000, fee: 0 });
  await setSetting(db, "seller", {
    legalName: "Studio Clayrity",
    gstin: "",
    stateCode: "29",
    address: "",
    isConfirmed: true,
  });
  razorpay = new FakeRazorpay();
  deps = {
    payment: new RazorpayProvider("rzp_test_k", "key_secret", WEBHOOK_SECRET, razorpay.fetch),
    paymentsConfigured: true,
    appEnv: "test",
  };
});

describe("fulfilment and shipping", () => {
  it("records a shipment, stepping the order through processing and packed to shipped", async () => {
    const order = await paidOrder();
    const { shipment, notifications } = await recordShipment(
      db,
      order.id,
      { carrier: "Delhivery", awb: "DL123", trackingUrl: "https://t/DL123", isInsured: true },
      admin,
    );
    expect(shipment).toMatchObject({
      carrier: "Delhivery",
      awb: "DL123",
      status: "label_created",
      isInsured: true,
    });
    expect(notifications).toEqual([{ kind: "shipped", orderId: order.id }]);
    const steps = await db
      .select({ to: orderEvents.toStatus })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, order.id));
    expect(steps.map((s) => s.to)).toEqual(["pending_payment", "paid", "processing", "packed", "shipped"]);
    await expect(recordShipment(db, order.id, { carrier: "Delhivery", awb: "DL123" }, admin)).rejects.toThrow(
      OrderActionError,
    );
  });

  it("follows courier updates forward only", async () => {
    const order = await paidOrder();
    await recordShipment(db, order.id, { carrier: "Delhivery", awb: "DL555" }, admin);

    expect((await applyTrackingUpdate(db, { awb: "DL555", status: "IN TRANSIT" })).applied).toBe(true);
    const out = await applyTrackingUpdate(db, { awb: "DL555", status: "OUT FOR DELIVERY" });
    expect(out.notifications).toEqual([{ kind: "out_for_delivery", orderId: order.id }]);
    expect(await statusOf(order.id)).toBe("out_for_delivery");

    const delivered = await applyTrackingUpdate(db, { awb: "DL555", status: "DELIVERED" });
    expect(delivered.notifications).toEqual([{ kind: "delivered", orderId: order.id }]);
    expect(await statusOf(order.id)).toBe("delivered");

    // Late or repeated updates change nothing
    expect((await applyTrackingUpdate(db, { awb: "DL555", status: "IN TRANSIT" })).applied).toBe(false);
    expect((await applyTrackingUpdate(db, { awb: "DL555", status: "DELIVERED" })).applied).toBe(false);
    expect((await applyTrackingUpdate(db, { awb: "UNKNOWN", status: "DELIVERED" })).applied).toBe(false);
    expect((await applyTrackingUpdate(db, { awb: "DL555", status: "WEIRD" })).applied).toBe(false);
    const [s] = await db.select().from(shipments).where(eq(shipments.awb, "DL555"));
    expect(s.deliveredAt).not.toBeNull();
  });

  it("marks a return to origin without restocking (owner inspects first)", async () => {
    const order = await paidOrder();
    await recordShipment(db, order.id, { carrier: "Delhivery", awb: "DLRTO" }, admin);
    const before = await stock("SAMPLE-TRAY-001-L");
    await applyTrackingUpdate(db, { awb: "DLRTO", status: "RTO INITIATED" });
    expect(await statusOf(order.id)).toBe("returned");
    expect(await stock("SAMPLE-TRAY-001-L")).toBe(before);
  });

  it("books through Shiprocket using packed weights", async () => {
    const order = await paidOrder();
    let createBody: Record<string, unknown> = {};
    const shiprocket = new ShiprocketProvider(
      { email: "a", password: "b", pickupLocation: "Studio", pickupPincode: "560001" },
      async (url, init) => {
        const path = String(url);
        if (path.endsWith("/auth/login")) return Response.json({ token: "t" });
        if (path.endsWith("/orders/create/adhoc")) {
          createBody = JSON.parse(String(init?.body));
          return Response.json({ order_id: 1, shipment_id: 2 });
        }
        if (path.endsWith("/courier/assign/awb"))
          return Response.json({ response: { data: { awb_code: "SR999", courier_name: "Blue Dart" } } });
        if (path.endsWith("/courier/generate/label"))
          return Response.json({ label_url: "https://label/2.pdf" });
        return Response.json({});
      },
    );
    const { shipment } = await bookShipment(db, shiprocket, order.id, admin);
    expect(shipment).toMatchObject({
      carrier: "Blue Dart",
      awb: "SR999",
      providerShipmentId: "2",
      labelUrl: "https://label/2.pdf",
      trackingUrl: "https://shiprocket.co/tracking/SR999",
    });
    // Large tray: 3.2 kg × 1.4 packed = 4.48 kg
    expect(createBody).toMatchObject({
      order_id: order.publicRef,
      payment_method: "Prepaid",
      weight: 4.48,
      billing_state: "Maharashtra",
    });
    await expect(bookShipment(db, new ManualShippingProvider(), order.id, admin)).rejects.toThrow(/manually/);
  });

  it("refuses to ship an unpaid order", async () => {
    const tokenHash = hashToken(generateToken());
    const cart = await getOrCreateCart(db, tokenHash);
    await addItem(db, cart.id, variantIds["SAMPLE-DISH-001"], 1);
    const r = await placeOrder(db, deps, { cartTokenHash: tokenHash, input: input() });
    if (r.kind !== "razorpay") throw new Error();
    const [order] = await db.select().from(orders).where(eq(orders.publicRef, r.orderRef));
    await expect(recordShipment(db, order.id, { carrier: "X", awb: "1" }, admin)).rejects.toThrow(
      /can't be marked shipped/,
    );
  });
});

describe("cancellation", () => {
  it("cancels a COD order, restocks and releases the coupon", async () => {
    const order = await paidOrder("SAMPLE-TRAY-001-L", { cod: true, coupon: "SAMPLE10" });
    expect(await stock("SAMPLE-TRAY-001-L")).toBe(3);
    expect(
      await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, order.id)),
    ).toHaveLength(1);

    const { notifications } = await cancelOrder(db, order.id, {
      ...admin,
      reason: "Customer changed their mind",
    });
    expect(notifications).toEqual([{ kind: "cancelled", orderId: order.id, refundExpected: false }]);
    expect(await statusOf(order.id)).toBe("cancelled");
    expect(await stock("SAMPLE-TRAY-001-L")).toBe(4);
    expect(
      await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, order.id)),
    ).toHaveLength(0);
  });

  it("moves a paid online order to refund pending", async () => {
    const order = await paidOrder();
    const { notifications } = await cancelOrder(db, order.id, { ...admin, reason: "Out of stock" });
    expect(notifications[0]).toMatchObject({ refundExpected: true });
    expect(await statusOf(order.id)).toBe("refund_pending");
  });

  it("refuses once shipped", async () => {
    const order = await paidOrder();
    await recordShipment(db, order.id, { carrier: "Delhivery", awb: "DLX" }, admin);
    await expect(cancelOrder(db, order.id, { ...admin, reason: "x" })).rejects.toThrow(/already shipped/);
  });
});

describe("refunds", () => {
  it("refunds in full through Razorpay and closes the order", async () => {
    const order = await paidOrder();
    await cancelOrder(db, order.id, { ...admin, reason: "Cancelled" });
    const { refund, notifications } = await refundOrder(db, deps.payment, order.id, {
      ...admin,
      reason: "Cancelled order",
    });
    expect(razorpay.refunds).toEqual([{ paymentId: expect.stringMatching(/^pay_/), amount: order.total }]);
    expect(refund).toMatchObject({ status: "processed", amount: order.total });
    expect(notifications).toEqual([
      { kind: "refund_processed", orderId: order.id, refundId: refund.id, amount: order.total },
    ]);
    expect(await statusOf(order.id)).toBe("refunded");
    const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id));
    expect(payment.status).toBe("refunded");
  });

  it("allows partial refunds on a paid order and never more than was paid", async () => {
    const order = await paidOrder();
    await refundOrder(db, deps.payment, order.id, { ...admin, amount: 100_000, reason: "Small chip" });
    expect(await statusOf(order.id)).toBe("paid");
    const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id));
    expect(payment.status).toBe("partially_refunded");
    await expect(
      refundOrder(db, deps.payment, order.id, { ...admin, amount: order.total, reason: "x" }),
    ).rejects.toThrow(/At most/);
    // A full refund of the remainder needs the order cancelled or returned first
    await expect(refundOrder(db, deps.payment, order.id, { ...admin, reason: "x" })).rejects.toThrow(
      /Cancel the order/,
    );
  });

  it("waits for Razorpay's webhook when the refund is still pending", async () => {
    razorpay.refundStatus = "pending";
    const order = await paidOrder();
    await cancelOrder(db, order.id, { ...admin, reason: "x" });
    const { refund, notifications } = await refundOrder(db, deps.payment, order.id, {
      ...admin,
      reason: "x",
    });
    expect(refund.status).toBe("pending");
    expect(notifications).toEqual([]);
    expect(await statusOf(order.id)).toBe("refund_pending");

    const delivery = webhook("refund.processed", {
      refund: {
        entity: { id: refund.providerRefundId, payment_id: "p", amount: refund.amount, status: "processed" },
      },
    });
    const first = await handleRazorpayWebhook(db, deps.payment, delivery);
    expect(first.notifications).toHaveLength(1);
    expect(await statusOf(order.id)).toBe("refunded");
    const again = await handleRazorpayWebhook(db, deps.payment, {
      ...delivery,
      eventId: `evt_${randomUUID()}`,
    });
    expect(again.notifications).toEqual([]);
  });

  it("marks a failed refund and lets it be retried", async () => {
    const order = await paidOrder();
    await cancelOrder(db, order.id, { ...admin, reason: "x" });
    razorpay.refundStatus = "pending";
    const { refund } = await refundOrder(db, deps.payment, order.id, { ...admin, reason: "x" });
    await handleRazorpayWebhook(
      db,
      deps.payment,
      webhook("refund.failed", {
        refund: {
          entity: { id: refund.providerRefundId, payment_id: "p", amount: refund.amount, status: "failed" },
        },
      }),
    );
    expect((await db.select().from(refunds).where(eq(refunds.id, refund.id)))[0].status).toBe("failed");
    razorpay.refundStatus = "processed";
    await refundOrder(db, deps.payment, order.id, { ...admin, reason: "retry" });
    expect(await statusOf(order.id)).toBe("refunded");
  });

  it("sends COD refunds to the manual route", async () => {
    const order = await paidOrder("SAMPLE-TRAY-001-L", { cod: true });
    await expect(refundOrder(db, deps.payment, order.id, { ...admin, reason: "x" })).rejects.toThrow(
      /bank transfer/,
    );
    await cancelOrder(db, order.id, { ...admin, reason: "x" });
    await transitionOrder(db, order.id, "refund_pending", {
      ...admin,
      note: "Collected cash, returning it",
    }).catch(() => {});
    await expect(
      recordManualRefund(db, order.id, { ...admin, amount: order.total, reference: "" }),
    ).rejects.toThrow(/reference/);
    const { refund } = await recordManualRefund(db, order.id, {
      ...admin,
      amount: order.total,
      reference: "NEFT UTR123",
    });
    expect(refund.status).toBe("processed");
  });
});

describe("notifications", () => {
  it("emails the shipped details once, however often it's triggered", async () => {
    const order = await paidOrder();
    const { notifications } = await recordShipment(
      db,
      order.id,
      { carrier: "Delhivery", awb: "DLMAIL", trackingUrl: "https://t/DLMAIL" },
      admin,
    );
    const email = new RecordingEmail();
    await deliverNotifications(db, email, SITE, notifications);
    await deliverNotifications(db, email, SITE, notifications);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]).toMatchObject({
      to: "ananya@example.com",
      subject: `Your order ${order.publicRef} is on its way`,
    });
    expect(email.sent[0].text).toContain("Tracking number: DLMAIL");
    expect(email.sent[0].text).toContain("https://t/DLMAIL");
  });
});

describe("stock alerts", () => {
  it("lists low stock and sends one digest per day", async () => {
    await db
      .update(inventory)
      .set({ onHand: 1 })
      .where(eq(inventory.variantId, variantIds["SAMPLE-TRAY-001-L"]));
    expect((await lowStockRows(db)).map((r) => r.sku)).toContain("SAMPLE-TRAY-001-L");
    const email = new RecordingEmail();
    const now = new Date("2026-10-10T03:00:00Z");
    expect(await sendLowStockDigest(db, email, SITE, "owner@studio.test", now)).toBe("sent");
    expect(await sendLowStockDigest(db, email, SITE, "owner@studio.test", now)).toBe("already_sent");
    expect(await sendLowStockDigest(db, email, SITE, undefined, now)).toBe("skipped");
    expect(email.sent[0].subject).toMatch(/^Low stock: \d+ piece/);
  });

  it("emails people waiting for a piece once it's back, and only once", async () => {
    const variant = variantIds["SAMPLE-BOOK-001"];
    await db.update(inventory).set({ onHand: 0 }).where(eq(inventory.variantId, variant));
    await db.insert(backInStockRequests).values([
      { variantId: variant, email: "a@example.com" },
      { variantId: variant, email: "b@example.com" },
    ]);
    const email = new RecordingEmail();
    expect(await notifyBackInStock(db, email, SITE, variant)).toBe(0);
    await db.update(inventory).set({ onHand: 2 }).where(eq(inventory.variantId, variant));
    expect(await notifyBackInStock(db, email, SITE, variant)).toBe(2);
    expect(await notifyBackInStock(db, email, SITE, variant)).toBe(0);
    expect(email.sent.map((m) => m.to).sort()).toEqual(["a@example.com", "b@example.com"]);
    const open = await db
      .select()
      .from(backInStockRequests)
      .where(and(eq(backInStockRequests.variantId, variant)));
    expect(open.every((r) => r.notifiedAt)).toBe(true);
  });
});

describe("guest order tracking", () => {
  it("needs the right email or phone and shows a customer-facing timeline", async () => {
    const order = await paidOrder();
    await recordShipment(
      db,
      order.id,
      { carrier: "Delhivery", awb: "DLTRK", trackingUrl: "https://t/DLTRK" },
      admin,
    );

    const byEmail = await findOrderForTracking(db, {
      orderRef: order.publicRef.toLowerCase(),
      contact: "ANANYA@example.com",
    });
    expect(byEmail?.timeline.map((t) => t.label)).toEqual([
      "Order placed",
      "Payment confirmed",
      "Being prepared",
      "Packed",
      "Shipped",
    ]);
    expect(byEmail?.shipment).toEqual({ carrier: "Delhivery", awb: "DLTRK", trackingUrl: "https://t/DLTRK" });

    expect(
      await findOrderForTracking(db, { orderRef: order.publicRef, contact: "+91 98765 43210" }),
    ).not.toBeNull();
    expect(
      await findOrderForTracking(db, { orderRef: order.publicRef, contact: "someone@else.com" }),
    ).toBeNull();
    expect(
      await findOrderForTracking(db, { orderRef: "SC-NOPE99", contact: "ananya@example.com" }),
    ).toBeNull();
    expect(await findOrderForTracking(db, { orderRef: "'; drop table orders;--", contact: "x" })).toBeNull();
  });
});
