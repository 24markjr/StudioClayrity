import { describe, expect, it } from "vitest";
import { renderEmail } from "./layout";
import {
  backInStockEmail,
  lowStockDigestEmail,
  orderCancelledEmail,
  orderDeliveredEmail,
  orderOutForDeliveryEmail,
  orderShippedEmail,
  ownerNewOrderEmail,
  refundProcessedEmail,
} from "./order-emails";

const site = "https://studioclayrity.com";
const order = {
  publicRef: "SC-7K3Q9X",
  email: "a@example.com",
  total: 905_000,
  paymentMethod: "cod",
  isTest: false,
  shippingAddress: {
    fullName: "Ananya Rao",
    line1: "12 Lavelle Road",
    city: "Mumbai",
    stateCode: "27",
    pincode: "400001",
  },
};
const items = [{ productName: "Travertine Tray", variantName: "Large", quantity: 1 }];

describe("email layout", () => {
  it("escapes everything and produces a plain-text twin", () => {
    const email = renderEmail(
      { subject: "<b>", preheader: "p", heading: "Hi <script>", paragraphs: ["a & b"] },
      site,
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("Hi &lt;script&gt;");
    expect(email.html).toContain("a &amp; b");
    expect(email.text).toContain("Hi <script>");
  });
});

describe("order emails", () => {
  it("shipped: carrier, AWB, tracking link, COD amount and address", () => {
    const email = orderShippedEmail(
      order,
      items,
      { carrier: "Delhivery", awb: "AWB123", trackingUrl: "https://track/AWB123" },
      site,
    );
    expect(email.subject).toBe("Your order SC-7K3Q9X is on its way");
    expect(email.text).toContain("Delhivery. Tracking number: AWB123");
    expect(email.text).toContain("Track your order: https://track/AWB123");
    expect(email.text).toContain("Please keep ₹9,050 ready");
    expect(email.text).toContain("Mumbai, Maharashtra 400001");
  });

  it("shipped without a tracking URL links to the track-order page", () => {
    const email = orderShippedEmail(
      { ...order, paymentMethod: "razorpay" },
      items,
      { carrier: null, awb: null, trackingUrl: null },
      site,
    );
    expect(email.text).toContain(`${site}/track-order?ref=SC-7K3Q9X`);
    expect(email.text).not.toContain("ready for the courier");
  });

  it("covers the rest of the journey", () => {
    expect(orderOutForDeliveryEmail(order, site).subject).toContain("out for delivery");
    expect(orderDeliveredEmail(order, site).subject).toContain("delivered");
    expect(orderCancelledEmail(order, site, true).text).toContain("We're refunding ₹9,050");
    expect(orderCancelledEmail(order, site, false).text).toContain("Nothing has been charged");
    expect(refundProcessedEmail(order, 905_000, site).subject).toBe("Refund of ₹9,050 for order SC-7K3Q9X");
  });

  it("makes no unapproved promises (time limits, delivery dates)", () => {
    const all = [
      orderShippedEmail(order, items, { carrier: "X", awb: "1", trackingUrl: null }, site),
      orderDeliveredEmail(order, site),
      refundProcessedEmail(order, 1, site),
    ]
      .map((e) => e.text)
      .join("\n");
    expect(all).not.toMatch(/\d+\s*hours|\d+\s*(–|-)\s*\d+\s*working days/);
  });

  it("owner and stock emails", () => {
    expect(ownerNewOrderEmail({ ...order, isTest: true }, items, site).subject).toBe(
      "[TEST] New order SC-7K3Q9X · ₹9,050",
    );
    const digest = lowStockDigestEmail([{ name: "Tray", sku: "T-L", available: 1, threshold: 2 }], site);
    expect(digest.subject).toBe("Low stock: 1 piece");
    expect(digest.text).toContain("Tray — T-L: 1 left");
    expect(backInStockEmail({ name: "Tray", slug: "tray", variantName: "Large" }, site).text).toContain(
      `${site}/products/tray`,
    );
  });
});
