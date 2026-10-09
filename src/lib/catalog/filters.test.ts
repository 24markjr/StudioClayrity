import { describe, expect, it } from "vitest";
import { activeFilterCount, parseListingParams, toggleValue, toQueryString } from "./filters";

describe("parseListingParams", () => {
  it("returns defaults for an empty query", () => {
    expect(parseListingParams({})).toEqual({
      materials: [],
      finishes: [],
      types: [],
      priceMin: null,
      priceMax: null,
      inStock: false,
      category: null,
      sort: "featured",
      page: 1,
    });
  });

  it("parses comma lists and repeated keys, de-duplicated", () => {
    expect(parseListingParams({ material: "Marble,Travertine,Marble" }).materials).toEqual([
      "Marble",
      "Travertine",
    ]);
    expect(parseListingParams({ material: ["Marble", "Stoneware"] }).materials).toEqual([
      "Marble",
      "Stoneware",
    ]);
  });

  it("drops unknown types and sorts", () => {
    const f = parseListingParams({ type: "unique,bogus", sort: "cheapest" });
    expect(f.types).toEqual(["unique"]);
    expect(f.sort).toBe("featured");
  });

  it("validates prices and swaps an inverted range", () => {
    expect(parseListingParams({ min: "abc", max: "-5" })).toMatchObject({ priceMin: null, priceMax: null });
    expect(parseListingParams({ min: "20000", max: "5000" })).toMatchObject({
      priceMin: 5000,
      priceMax: 20000,
    });
  });

  it("clamps the page and validates the category slug", () => {
    expect(parseListingParams({ page: "0" }).page).toBe(1);
    expect(parseListingParams({ page: "99999" }).page).toBe(1);
    expect(parseListingParams({ page: "3" }).page).toBe(3);
    expect(parseListingParams({ category: "bowls" }).category).toBe("bowls");
    expect(parseListingParams({ category: "Bowls; DROP TABLE" }).category).toBeNull();
  });

  it("caps list length to keep queries bounded", () => {
    const many = Array.from({ length: 50 }, (_, i) => `m${i}`).join(",");
    expect(parseListingParams({ material: many }).materials).toHaveLength(20);
  });
});

describe("toQueryString", () => {
  it("round-trips through parse", () => {
    const f = parseListingParams({
      material: "Travertine,Marble",
      type: "unique",
      min: "1000",
      stock: "1",
      sort: "newest",
      page: "2",
    });
    expect(toQueryString(f)).toBe(
      "?material=Marble%2CTravertine&type=unique&min=1000&stock=1&sort=newest&page=2",
    );
    expect(parseListingParams(Object.fromEntries(new URLSearchParams(toQueryString(f))))).toEqual(f);
  });

  it("omits defaults", () => {
    expect(toQueryString(parseListingParams({}))).toBe("");
  });
});

describe("helpers", () => {
  it("counts active filters", () => {
    expect(
      activeFilterCount(parseListingParams({ material: "A,B", stock: "1", sort: "newest", page: "3" })),
    ).toBe(3);
  });

  it("toggles a value and resets the page", () => {
    const f = parseListingParams({ material: "Marble", page: "4" });
    expect(toggleValue(f, "materials", "Marble")).toMatchObject({ materials: [], page: 1 });
    expect(toggleValue(f, "materials", "Travertine").materials).toEqual(["Marble", "Travertine"]);
  });
});
