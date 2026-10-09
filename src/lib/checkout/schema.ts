import { z } from "zod";
import { isStateCode, isValidGstin, isValidPincode, normaliseIndianMobile } from "../domain/india";

/**
 * Checkout input. The same schema validates in the browser (for instant feedback) and on
 * the server (the only validation that counts). Amounts are never part of the input — the
 * server prices everything — except `expectedTotal`, which only detects that the price the
 * shopper saw has changed.
 */

const trimmed = (max: number, message: string) => z.string().trim().min(1, message).max(max);

const mobile = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normaliseIndianMobile(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Enter a 10-digit Indian mobile number." });
      return z.NEVER;
    }
    return n;
  });

export const addressSchema = z.object({
  fullName: trimmed(80, "Enter the full name."),
  phone: mobile,
  line1: trimmed(120, "Enter the house or flat number and street."),
  line2: z.string().trim().max(120).optional().default(""),
  landmark: z.string().trim().max(80).optional().default(""),
  city: trimmed(60, "Enter the city or town."),
  stateCode: z.string().refine(isStateCode, "Choose a state."),
  pincode: z.string().trim().refine(isValidPincode, "Enter a 6-digit PIN code."),
});

export type AddressInput = z.input<typeof addressSchema>;
export type Address = z.output<typeof addressSchema>;

export const PAYMENT_METHODS = ["razorpay", "cod"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const checkoutSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .pipe(z.email({ message: "Enter a valid email address." })),
    shipping: addressSchema,
    billingSameAsShipping: z.boolean(),
    billing: addressSchema.optional(),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .transform((v) => v || undefined)
      .refine(
        (v) => v === undefined || isValidGstin(v),
        "Enter a valid 15-character GSTIN, or leave it blank.",
      ),
    shippingMethod: z.enum(["standard", "express"]),
    paymentMethod: z.enum(PAYMENT_METHODS),
    customerNote: z.string().trim().max(500).optional().default(""),
    /** Total (paise) the shopper last saw — a mismatch means prices changed */
    expectedTotal: z.number().int().nonnegative().optional(),
    /** Generated once per checkout page load; makes double submits safe */
    idempotencyKey: z.uuid(),
  })
  .superRefine((value, ctx) => {
    if (!value.billingSameAsShipping && !value.billing) {
      ctx.addIssue({ code: "custom", path: ["billing"], message: "Enter a billing address." });
    }
  });

export type CheckoutInput = z.input<typeof checkoutSchema>;
export type CheckoutData = z.output<typeof checkoutSchema>;

/** Flatten Zod issues to { "shipping.pincode": "Enter a 6-digit PIN code." }. */
export function fieldErrors(error: z.ZodError) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    errors[key] ??= issue.message;
  }
  return errors;
}
