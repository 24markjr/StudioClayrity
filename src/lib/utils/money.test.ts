import { describe, expect, it } from "vitest";
import { formatMoney, rupeesToPaise } from "./money";

describe("formatMoney", () => {
  it("formats whole rupees without paise using Indian grouping", () => {
    expect(formatMoney(850000)).toBe("₹8,500");
    expect(formatMoney(1250000_00)).toBe("₹12,50,000");
  });

  it("shows paise only when present", () => {
    expect(formatMoney(850050)).toBe("₹8,500.50");
  });

  it("rejects non-integer input", () => {
    expect(() => formatMoney(85.5)).toThrow(TypeError);
  });
});

describe("rupeesToPaise", () => {
  it("converts exactly", () => {
    expect(rupeesToPaise("8500")).toBe(850000);
    expect(rupeesToPaise("8,500.5")).toBe(850050);
    expect(rupeesToPaise(0.29)).toBe(29);
  });

  it("rejects malformed amounts", () => {
    expect(() => rupeesToPaise("8.555")).toThrow();
    expect(() => rupeesToPaise("-10")).toThrow();
    expect(() => rupeesToPaise("abc")).toThrow();
  });
});
