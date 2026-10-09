/**
 * Coupon evaluation — pure rules. The caller loads the coupon and usage counts inside the
 * checkout transaction and re-checks there, so concurrent orders cannot exceed limits.
 */

export type CouponRule = {
  code: string;
  type: "percent" | "fixed";
  /** percent: basis points · fixed: paise */
  value: number;
  minOrderTotal: number;
  maxDiscount: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  isActive: boolean;
};

export type CouponContext = {
  /** Sum of line amounts the coupon applies to (after scope filtering), in paise */
  eligibleSubtotal: number;
  /** Whole-order subtotal, used for the minimum-order check */
  orderSubtotal: number;
  now: Date;
  timesUsed: number;
  timesUsedByCustomer: number;
};

export type CouponRejection =
  | "inactive"
  | "not_started"
  | "expired"
  | "usage_limit_reached"
  | "customer_limit_reached"
  | "minimum_not_met"
  | "not_applicable";

export type CouponResult = { ok: true; discount: number } | { ok: false; reason: CouponRejection };

/** Customer-facing messages for each rejection reason. */
export const couponMessages: Record<CouponRejection, string> = {
  inactive: "This code is no longer active.",
  not_started: "This code isn't active yet.",
  expired: "This code has expired.",
  usage_limit_reached: "This code has reached its usage limit.",
  customer_limit_reached: "You've already used this code.",
  minimum_not_met: "Your order doesn't meet the minimum for this code.",
  not_applicable: "This code doesn't apply to the items in your bag.",
};

export function normaliseCouponCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function evaluateCoupon(coupon: CouponRule, ctx: CouponContext): CouponResult {
  if (!coupon.isActive) return { ok: false, reason: "inactive" };
  if (coupon.startsAt && ctx.now < coupon.startsAt) return { ok: false, reason: "not_started" };
  if (coupon.endsAt && ctx.now >= coupon.endsAt) return { ok: false, reason: "expired" };
  if (coupon.usageLimit !== null && ctx.timesUsed >= coupon.usageLimit) {
    return { ok: false, reason: "usage_limit_reached" };
  }
  if (coupon.perCustomerLimit !== null && ctx.timesUsedByCustomer >= coupon.perCustomerLimit) {
    return { ok: false, reason: "customer_limit_reached" };
  }
  if (ctx.orderSubtotal < coupon.minOrderTotal) return { ok: false, reason: "minimum_not_met" };
  if (ctx.eligibleSubtotal <= 0) return { ok: false, reason: "not_applicable" };

  let discount =
    coupon.type === "percent" ? Math.floor((ctx.eligibleSubtotal * coupon.value) / 10000) : coupon.value;
  if (coupon.maxDiscount !== null) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(discount, ctx.eligibleSubtotal);
  return { ok: true, discount };
}
