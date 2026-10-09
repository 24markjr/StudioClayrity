import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkoutSchema, fieldErrors, type CheckoutInput } from "./schema";

const address = {
  fullName: "Ananya Rao",
  phone: "+91 98765 43210",
  line1: "12 Lavelle Road",
  city: "Bengaluru",
  stateCode: "29",
  pincode: "560001",
};

const valid = (overrides: Partial<CheckoutInput> = {}): CheckoutInput => ({
  email: " Ananya@Example.com ",
  shipping: address,
  billingSameAsShipping: true,
  shippingMethod: "standard",
  paymentMethod: "razorpay",
  idempotencyKey: randomUUID(),
  ...overrides,
});

describe("checkoutSchema", () => {
  it("accepts a valid checkout and normalises email and phone", () => {
    const parsed = checkoutSchema.parse(valid());
    expect(parsed.email).toBe("ananya@example.com");
    expect(parsed.shipping.phone).toBe("9876543210");
    expect(parsed.gstin).toBeUndefined();
  });

  it("reports field-level errors with paths", () => {
    const result = checkoutSchema.safeParse(
      valid({ email: "nope", shipping: { ...address, pincode: "12345", phone: "12345", stateCode: "99" } }),
    );
    expect(result.success).toBe(false);
    const errors = fieldErrors(result.error!);
    expect(errors).toMatchObject({
      email: "Enter a valid email address.",
      "shipping.pincode": "Enter a 6-digit PIN code.",
      "shipping.phone": "Enter a 10-digit Indian mobile number.",
      "shipping.stateCode": "Choose a state.",
    });
  });

  it("requires a billing address when it differs from shipping", () => {
    const result = checkoutSchema.safeParse(valid({ billingSameAsShipping: false }));
    expect(fieldErrors(result.error!)).toEqual({ billing: "Enter a billing address." });
    expect(checkoutSchema.safeParse(valid({ billingSameAsShipping: false, billing: address })).success).toBe(
      true,
    );
  });

  it("validates an optional GSTIN", () => {
    expect(checkoutSchema.parse(valid({ gstin: " 27aapfu0939f1zv " })).gstin).toBe("27AAPFU0939F1ZV");
    expect(checkoutSchema.parse(valid({ gstin: "" })).gstin).toBeUndefined();
    expect(checkoutSchema.safeParse(valid({ gstin: "27AAPFU0939F1ZW" })).success).toBe(false);
  });

  it("rejects unknown methods and a missing idempotency key", () => {
    expect(checkoutSchema.safeParse(valid({ paymentMethod: "upi" as never })).success).toBe(false);
    expect(checkoutSchema.safeParse(valid({ idempotencyKey: "abc" })).success).toBe(false);
  });
});
