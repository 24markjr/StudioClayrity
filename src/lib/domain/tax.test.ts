import { describe, expect, it } from "vitest";
import { extractInclusiveTax, isIntraState, splitGst } from "./tax";

describe("extractInclusiveTax", () => {
  it("extracts 18% GST from an inclusive price", () => {
    // ₹11,800 incl. 18% → ₹1,800 tax
    expect(extractInclusiveTax(1_180_000, 1800)).toBe(180_000);
  });

  it("extracts 12% and 5%", () => {
    expect(extractInclusiveTax(112_000, 1200)).toBe(12_000);
    expect(extractInclusiveTax(105_000, 500)).toBe(5_000);
  });

  it("rounds to the nearest paisa", () => {
    // 8500 * 18/118 = 1296.61… → ₹1,296.61 → 129661 paise
    expect(extractInclusiveTax(850_000, 1800)).toBe(129_661);
  });

  it("returns zero for a zero rate or amount", () => {
    expect(extractInclusiveTax(850_000, 0)).toBe(0);
    expect(extractInclusiveTax(0, 1800)).toBe(0);
  });

  it("rejects invalid input", () => {
    expect(() => extractInclusiveTax(100.5, 1800)).toThrow();
    expect(() => extractInclusiveTax(-1, 1800)).toThrow();
    expect(() => extractInclusiveTax(100, 3000)).toThrow();
  });
});

describe("splitGst", () => {
  it("splits intra-state tax into equal CGST and SGST", () => {
    expect(splitGst(180_000, true)).toEqual({ cgst: 90_000, sgst: 90_000, igst: 0 });
  });

  it("gives the odd paisa to SGST so parts sum exactly", () => {
    const split = splitGst(129_661, true);
    expect(split).toEqual({ cgst: 64_830, sgst: 64_831, igst: 0 });
    expect(split.cgst + split.sgst).toBe(129_661);
  });

  it("uses IGST for inter-state supply", () => {
    expect(splitGst(129_661, false)).toEqual({ cgst: 0, sgst: 0, igst: 129_661 });
  });

  it("decides intra-state by comparing state codes", () => {
    expect(isIntraState("29", "29")).toBe(true);
    expect(isIntraState("29", "27")).toBe(false);
  });
});
