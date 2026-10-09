import { describe, expect, it } from "vitest";
import { orderConfirmationEmail } from "./order-confirmation";

const order = {
  publicRef: "SC-7K3Q9X",
  paymentMethod: "razorpay",
  subtotal: 850_000,
  discountTotal: 85_000,
  shippingTotal: 0,
  giftWrapTotal: 0,
  codFee: 0,
  total: 765_000,
  taxTotal: 116_695,
  couponCode: "SAMPLE10",
  shippingAddress: {
    fullName: "Ananya <Rao>",
    line1: "12 Lavelle Road",
    city: "Bengaluru",
    stateCode: "29",
    pincode: "560001",
  },
};

describe("orderConfirmationEmail", () => {
  it("summarises the order in text and HTML", () => {
    const email = orderConfirmationEmail(
      order,
      [{ productName: "Travertine Tray", variantName: "Large", quantity: 1, lineTotal: 765_000 }],
      "https://studioclayrity.com",
    );
    expect(email.subject).toBe("Your Studio Clayrity order SC-7K3Q9X");
    expect(email.text).toContain("1 × Travertine Tray (Large): ₹7,650");
    expect(email.text).toContain("Discount (SAMPLE10): − ₹850");
    expect(email.text).toContain("Total paid: ₹7,650");
    expect(email.text).toContain("Bengaluru, Karnataka 560001");
  });

  it("escapes customer-supplied text in HTML", () => {
    const email = orderConfirmationEmail(order, [], "https://studioclayrity.com");
    expect(email.html).toContain("Ananya &lt;Rao&gt;");
    expect(email.html).not.toContain("<Rao>");
  });

  it("tells cash-on-delivery customers what to pay", () => {
    const email = orderConfirmationEmail({ ...order, paymentMethod: "cod", codFee: 5_000 }, [], "https://x");
    expect(email.text).toContain("To pay on delivery");
    expect(email.text).toContain("Cash on delivery fee: ₹50");
  });
});
