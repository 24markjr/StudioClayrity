import { describe, expect, it } from "vitest";
import { evaluateCoupon, normaliseCouponCode, type CouponContext, type CouponRule } from "./coupons";

const now = new Date("2026-10-09T10:00:00Z");

const rule = (overrides: Partial<CouponRule> = {}): CouponRule => ({
  code: "WELCOME10",
  type: "percent",
  value: 1000,
  minOrderTotal: 0,
  maxDiscount: null,
  startsAt: null,
  endsAt: null,
  usageLimit: null,
  perCustomerLimit: null,
  isActive: true,
  ...overrides,
});

const ctx = (overrides: Partial<CouponContext> = {}): CouponContext => ({
  eligibleSubtotal: 1_000_000,
  orderSubtotal: 1_000_000,
  now,
  timesUsed: 0,
  timesUsedByCustomer: 0,
  ...overrides,
});

describe("evaluateCoupon", () => {
  it("applies a percentage", () => {
    expect(evaluateCoupon(rule(), ctx())).toEqual({ ok: true, discount: 100_000 });
  });

  it("caps a percentage with maxDiscount", () => {
    expect(evaluateCoupon(rule({ maxDiscount: 50_000 }), ctx())).toEqual({ ok: true, discount: 50_000 });
  });

  it("applies a fixed amount, never more than the eligible subtotal", () => {
    expect(evaluateCoupon(rule({ type: "fixed", value: 150_000 }), ctx())).toEqual({
      ok: true,
      discount: 150_000,
    });
    expect(
      evaluateCoupon(rule({ type: "fixed", value: 150_000 }), ctx({ eligibleSubtotal: 100_000 })),
    ).toEqual({
      ok: true,
      discount: 100_000,
    });
  });

  it("rounds percentage discounts down to whole paise", () => {
    expect(evaluateCoupon(rule({ value: 1500 }), ctx({ eligibleSubtotal: 333 }))).toEqual({
      ok: true,
      discount: 49,
    });
  });

  it.each([
    [rule({ isActive: false }), ctx(), "inactive"],
    [rule({ startsAt: new Date("2026-11-01") }), ctx(), "not_started"],
    [rule({ endsAt: new Date("2026-10-01") }), ctx(), "expired"],
    [rule({ endsAt: now }), ctx(), "expired"],
    [rule({ usageLimit: 100 }), ctx({ timesUsed: 100 }), "usage_limit_reached"],
    [rule({ perCustomerLimit: 1 }), ctx({ timesUsedByCustomer: 1 }), "customer_limit_reached"],
    [rule({ minOrderTotal: 2_000_000 }), ctx(), "minimum_not_met"],
    [rule(), ctx({ eligibleSubtotal: 0 }), "not_applicable"],
  ] as const)("rejects: %#", (coupon, context, reason) => {
    expect(evaluateCoupon(coupon, context)).toEqual({ ok: false, reason });
  });
});

describe("normaliseCouponCode", () => {
  it("upper-cases and strips spaces", () => {
    expect(normaliseCouponCode("  welcome 10 ")).toBe("WELCOME10");
  });
});
