import { describe, expect, it } from "vitest";
import { estimateShipping, type ShippingRules } from "./shipping-rules";

const rules: ShippingRules = {
  ratesConfirmed: true,
  flatRate: 50_000,
  freeAbove: 1_000_000,
  expressRate: 120_000,
};

describe("estimateShipping", () => {
  it("never quotes before the owner confirms rates", () => {
    expect(estimateShipping({ ...rules, ratesConfirmed: false }, 500_000)).toEqual({ status: "unconfirmed" });
  });

  it("charges the flat rate below the threshold and says how far to free shipping", () => {
    expect(estimateShipping(rules, 700_000)).toEqual({
      status: "quoted",
      amount: 50_000,
      method: "standard",
      isFree: false,
      amountToFree: 300_000,
    });
  });

  it("is free at or above the threshold", () => {
    expect(estimateShipping(rules, 1_000_000)).toMatchObject({ amount: 0, isFree: true, amountToFree: null });
  });

  it("has no threshold message when there is no threshold", () => {
    expect(estimateShipping({ ...rules, freeAbove: null }, 5_000_000)).toMatchObject({
      amount: 50_000,
      amountToFree: null,
    });
  });

  it("prices express separately and never makes it free", () => {
    expect(estimateShipping(rules, 5_000_000, "express")).toMatchObject({
      amount: 120_000,
      isFree: false,
      amountToFree: null,
    });
    expect(estimateShipping({ ...rules, expressRate: null }, 1, "express")).toEqual({
      status: "unconfirmed",
    });
  });
});
