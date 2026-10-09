import { describe, expect, it } from "vitest";
import { allocateProportionally, priceOrder } from "./pricing";

const base = { chargesGstRateBp: 1800, sellerStateCode: "29" };

describe("allocateProportionally", () => {
  it("distributes exactly, with whole paise", () => {
    const parts = allocateProportionally(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
  });

  it("weights by line value", () => {
    expect(allocateProportionally(1000, [3000, 1000])).toEqual([750, 250]);
  });

  it("handles zero weights", () => {
    expect(allocateProportionally(500, [0, 0])).toEqual([0, 0]);
    expect(allocateProportionally(500, [0, 100])).toEqual([0, 500]);
  });
});

describe("priceOrder", () => {
  it("prices a single intra-state line", () => {
    const result = priceOrder({
      ...base,
      placeOfSupplyStateCode: "29",
      lines: [{ key: "a", unitPrice: 1_180_000, quantity: 1, gstRateBp: 1800 }],
    });
    expect(result.subtotal).toBe(1_180_000);
    expect(result.total).toBe(1_180_000);
    expect(result.taxTotal).toBe(180_000);
    expect(result).toMatchObject({ cgst: 90_000, sgst: 90_000, igst: 0, intraState: true });
  });

  it("uses IGST for another state", () => {
    const result = priceOrder({
      ...base,
      placeOfSupplyStateCode: "27",
      lines: [{ key: "a", unitPrice: 1_180_000, quantity: 1, gstRateBp: 1800 }],
    });
    expect(result).toMatchObject({ cgst: 0, sgst: 0, igst: 180_000, intraState: false });
  });

  it("allocates a discount across lines and taxes the discounted amounts", () => {
    const result = priceOrder({
      ...base,
      placeOfSupplyStateCode: "29",
      discount: 100_000,
      lines: [
        { key: "a", unitPrice: 300_000, quantity: 1, gstRateBp: 1800 },
        { key: "b", unitPrice: 100_000, quantity: 1, gstRateBp: 1200 },
      ],
    });
    expect(result.lines.map((l) => l.discount)).toEqual([75_000, 25_000]);
    expect(result.lines.map((l) => l.lineTotal)).toEqual([225_000, 75_000]);
    expect(result.total).toBe(300_000);
    // 225000·18/118 = 34322.03 → 34322; 75000·12/112 = 8035.71 → 8036
    expect(result.taxTotal).toBe(34_322 + 8_036);
  });

  it("only discounts eligible lines (scoped coupons)", () => {
    const result = priceOrder({
      ...base,
      placeOfSupplyStateCode: "29",
      discount: 50_000,
      lines: [
        { key: "a", unitPrice: 300_000, quantity: 1, gstRateBp: 1800, discountEligible: true },
        { key: "b", unitPrice: 100_000, quantity: 1, gstRateBp: 1800, discountEligible: false },
      ],
    });
    expect(result.lines.map((l) => l.discount)).toEqual([50_000, 0]);
  });

  it("never discounts more than the eligible amount", () => {
    const result = priceOrder({
      ...base,
      placeOfSupplyStateCode: "29",
      discount: 999_999,
      lines: [{ key: "a", unitPrice: 100_000, quantity: 2, gstRateBp: 1800 }],
    });
    expect(result.discountTotal).toBe(200_000);
    expect(result.total).toBe(0);
  });

  it("adds shipping, gift wrap and COD fee to the total and taxes them", () => {
    const result = priceOrder({
      ...base,
      placeOfSupplyStateCode: "07",
      shipping: 59_000,
      giftWrap: 29_500,
      codFee: 11_800,
      lines: [{ key: "a", unitPrice: 1_180_000, quantity: 1, gstRateBp: 1800 }],
    });
    expect(result.total).toBe(1_180_000 + 59_000 + 29_500 + 11_800);
    // charges: 100300 incl. 18% → 15300
    expect(result.taxTotal).toBe(180_000 + 15_300);
    expect(result.igst).toBe(result.taxTotal);
  });

  it("satisfies the database's total and tax-split invariants", () => {
    const result = priceOrder({
      ...base,
      placeOfSupplyStateCode: "29",
      discount: 12_345,
      shipping: 49_900,
      lines: [
        { key: "a", unitPrice: 849_900, quantity: 2, gstRateBp: 1800 },
        { key: "b", unitPrice: 129_900, quantity: 3, gstRateBp: 1200 },
      ],
    });
    expect(result.total).toBe(
      result.subtotal - result.discountTotal + result.shippingTotal + result.giftWrapTotal + result.codFee,
    );
    expect(result.cgst + result.sgst + result.igst).toBe(result.taxTotal);
    for (const line of result.lines) {
      expect(line.lineTotal).toBe(line.unitPrice * line.quantity - line.discount);
    }
  });

  it("rejects invalid amounts", () => {
    expect(() =>
      priceOrder({
        ...base,
        placeOfSupplyStateCode: "29",
        lines: [{ key: "a", unitPrice: 10.5, quantity: 1, gstRateBp: 0 }],
      }),
    ).toThrow();
    expect(() =>
      priceOrder({
        ...base,
        placeOfSupplyStateCode: "29",
        lines: [{ key: "a", unitPrice: 100, quantity: 0, gstRateBp: 0 }],
      }),
    ).toThrow();
    expect(() => priceOrder({ ...base, placeOfSupplyStateCode: "29", shipping: -1, lines: [] })).toThrow();
  });
});
