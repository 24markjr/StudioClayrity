/**
 * Shipping charge from the store's configured rules. Location-based rates (Shiprocket)
 * arrive in Phase 7; until then this is a flat rate with an optional free-shipping threshold.
 * Amounts are paise. Nothing is quoted until the owner has confirmed the rates.
 */

export type ShippingRules = {
  ratesConfirmed: boolean;
  flatRate: number;
  freeAbove: number | null;
  expressRate: number | null;
};

export type ShippingMethod = "standard" | "express";

export type ShippingEstimate =
  | { status: "unconfirmed" }
  | {
      status: "quoted";
      amount: number;
      method: ShippingMethod;
      isFree: boolean;
      amountToFree: number | null;
    };

/** `orderValue` is the bag value after discounts — the amount the threshold applies to. */
export function estimateShipping(
  rules: ShippingRules,
  orderValue: number,
  method: ShippingMethod = "standard",
): ShippingEstimate {
  if (!rules.ratesConfirmed) return { status: "unconfirmed" };
  if (method === "express" && rules.expressRate === null) return { status: "unconfirmed" };

  const qualifiesForFree = method === "standard" && rules.freeAbove !== null && orderValue >= rules.freeAbove;
  const amount = qualifiesForFree ? 0 : method === "express" ? rules.expressRate! : rules.flatRate;
  const amountToFree =
    method === "standard" && rules.freeAbove !== null && !qualifiesForFree
      ? rules.freeAbove - orderValue
      : null;

  return { status: "quoted", amount, method, isFree: amount === 0, amountToFree };
}
