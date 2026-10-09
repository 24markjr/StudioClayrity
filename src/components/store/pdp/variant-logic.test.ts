import { describe, expect, it } from "vitest";
import type { VariantDetail } from "@/lib/catalog/types";
import { initialVariant, optionNames, optionValues, selectOption, valueAvailable } from "./variant-logic";

const v = (
  sku: string,
  options: Record<string, string>,
  available: number | null,
  isDefault = false,
): VariantDetail => ({
  id: sku,
  sku,
  name: Object.values(options).join(" / "),
  options,
  price: 1000,
  compareAt: null,
  available,
  isDefault,
  dimensionsMm: { length: null, width: null, height: null },
  weightG: null,
});

const variants = [
  v("S-H", { Size: "Small", Finish: "Honed" }, 0, true),
  v("S-P", { Size: "Small", Finish: "Polished" }, 2),
  v("L-H", { Size: "Large", Finish: "Honed" }, 3),
];

describe("variant selection", () => {
  it("lists option names and values", () => {
    expect(optionNames(variants)).toEqual(["Size", "Finish"]);
    expect(optionValues(variants, "Finish")).toEqual(["Honed", "Polished"]);
  });

  it("starts on a purchasable variant when the default is sold out", () => {
    expect(initialVariant(variants).sku).toBe("S-P");
  });

  it("keeps other choices when changing one option", () => {
    expect(selectOption(variants, variants[1], "Size", "Small").sku).toBe("S-P");
    expect(selectOption(variants, variants[0], "Finish", "Polished").sku).toBe("S-P");
  });

  it("falls back to a matching variant when the exact combination doesn't exist", () => {
    // Large + Polished doesn't exist → Large / Honed
    expect(selectOption(variants, variants[1], "Size", "Large").sku).toBe("L-H");
  });

  it("marks values unavailable for the current combination", () => {
    expect(valueAvailable(variants, variants[1], "Finish", "Honed")).toBe(false);
    expect(valueAvailable(variants, variants[2], "Finish", "Honed")).toBe(true);
  });

  it("treats made-to-order (null) as available", () => {
    expect(initialVariant([v("M", {}, null, true)]).sku).toBe("M");
  });
});
