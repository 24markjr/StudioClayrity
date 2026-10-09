/**
 * Listing filters ⇄ URL query string. Filters live in the URL so a filtered view can be
 * shared, bookmarked and navigated with the back button. Parsing is strict: unknown or
 * malformed values are dropped rather than passed to the database.
 */

export const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

export const TYPE_OPTIONS = [
  { value: "unique", label: "One of a kind" },
  { value: "stock", label: "Ready to ship" },
  { value: "made_to_order", label: "Made to order" },
] as const;

export type TypeValue = (typeof TYPE_OPTIONS)[number]["value"];

export type ListingFilters = {
  materials: string[];
  finishes: string[];
  types: TypeValue[];
  /** Rupees (whole), as shown to shoppers; converted to paise for queries */
  priceMin: number | null;
  priceMax: number | null;
  inStock: boolean;
  /** Category slug filter on /shop (category pages fix this from the path) */
  category: string | null;
  sort: SortValue;
  page: number;
};

export const PAGE_SIZE = 12;

type RawParams = Record<string, string | string[] | undefined>;

function list(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : value ? value.split(",") : [];
  // Sorted so equivalent URLs produce identical filters (and share a cache entry)
  return [...new Set(values.map((v) => v.trim()).filter((v) => v && v.length <= 60))].slice(0, 20).sort();
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function wholeNumber(value: string | string[] | undefined, max: number) {
  const raw = first(value);
  if (!raw || !/^\d{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= max ? n : null;
}

export function parseListingParams(params: RawParams): ListingFilters {
  const sort = first(params.sort);
  const types = list(params.type).filter((t): t is TypeValue => TYPE_OPTIONS.some((o) => o.value === t));
  let priceMin = wholeNumber(params.min, 10_000_000);
  let priceMax = wholeNumber(params.max, 10_000_000);
  if (priceMin !== null && priceMax !== null && priceMin > priceMax)
    [priceMin, priceMax] = [priceMax, priceMin];
  const category = first(params.category);
  return {
    materials: list(params.material),
    finishes: list(params.finish),
    types,
    priceMin,
    priceMax,
    inStock: first(params.stock) === "1",
    category: category && /^[a-z0-9-]{1,80}$/.test(category) ? category : null,
    sort: SORT_OPTIONS.some((o) => o.value === sort) ? (sort as SortValue) : "featured",
    page: Math.max(1, Math.min(wholeNumber(params.page, 1000) ?? 1, 1000)),
  };
}

/** Serialise filters back to a query string (defaults omitted, keys in a stable order). */
export function toQueryString(filters: Partial<ListingFilters>) {
  const q = new URLSearchParams();
  if (filters.category) q.set("category", filters.category);
  if (filters.materials?.length) q.set("material", [...filters.materials].sort().join(","));
  if (filters.finishes?.length) q.set("finish", [...filters.finishes].sort().join(","));
  if (filters.types?.length) q.set("type", [...filters.types].sort().join(","));
  if (filters.priceMin != null) q.set("min", String(filters.priceMin));
  if (filters.priceMax != null) q.set("max", String(filters.priceMax));
  if (filters.inStock) q.set("stock", "1");
  if (filters.sort && filters.sort !== "featured") q.set("sort", filters.sort);
  if (filters.page && filters.page > 1) q.set("page", String(filters.page));
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Number of active filters (for the "Filter (3)" button). Sort and page don't count. */
export function activeFilterCount(f: ListingFilters) {
  return (
    f.materials.length +
    f.finishes.length +
    f.types.length +
    (f.priceMin != null ? 1 : 0) +
    (f.priceMax != null ? 1 : 0) +
    (f.inStock ? 1 : 0) +
    (f.category ? 1 : 0)
  );
}

/** Toggle one value in a multi-select filter; resets to page 1. */
export function toggleValue<K extends "materials" | "finishes" | "types">(
  filters: ListingFilters,
  key: K,
  value: ListingFilters[K][number],
): ListingFilters {
  const current = filters[key] as string[];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return { ...filters, [key]: next, page: 1 };
}
