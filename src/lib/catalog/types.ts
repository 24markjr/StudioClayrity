export type Uniqueness = "unique" | "stock" | "made_to_order";

export type ImageRef = {
  src: string;
  alt: string;
  kind?: string;
  variantId?: string | null;
  width?: number | null;
  height?: number | null;
};

/** Everything a product card needs — nothing more. */
export type CardProduct = {
  id: string;
  slug: string;
  name: string;
  /** Lowest active variant price, paise */
  price: number;
  compareAt: number | null;
  /** True when more than one price exists across variants ("From ₹…") */
  priceVaries: boolean;
  uniqueness: Uniqueness;
  leadTimeDays: number | null;
  available: boolean;
  isSample: boolean;
  images: ImageRef[];
};

export type VariantDetail = {
  id: string;
  sku: string;
  name: string | null;
  options: Record<string, string>;
  price: number;
  compareAt: number | null;
  /** null = not stock-limited (made to order) */
  available: number | null;
  isDefault: boolean;
  dimensionsMm: { length: number | null; width: number | null; height: number | null };
  weightG: number | null;
};

export type ProductDetail = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  material: string | null;
  finish: string | null;
  colour: string | null;
  careInstructions: string | null;
  variationNote: string | null;
  countryOfOrigin: string | null;
  uniqueness: Uniqueness;
  leadTimeDays: number | null;
  isSample: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  category: { slug: string; name: string } | null;
  collections: Array<{ slug: string; name: string }>;
  variants: VariantDetail[];
  images: ImageRef[];
};

export type Facets = {
  materials: Array<{ value: string; count: number }>;
  finishes: Array<{ value: string; count: number }>;
  types: Array<{ value: Uniqueness; count: number }>;
  price: { min: number; max: number } | null;
  inStockCount: number;
  total: number;
};

export type ListingResult = {
  items: CardProduct[];
  total: number;
  page: number;
  pageCount: number;
};

/** Short status label for cards and the PDP; null when nothing needs saying. */
export function statusLabel(p: Pick<CardProduct, "uniqueness" | "leadTimeDays" | "available">) {
  if (p.uniqueness === "made_to_order") {
    const weeks = p.leadTimeDays ? Math.max(1, Math.round(p.leadTimeDays / 7)) : null;
    return weeks ? `Made to order · ${weeks} ${weeks === 1 ? "week" : "weeks"}` : "Made to order";
  }
  if (!p.available) return p.uniqueness === "unique" ? "Sold" : "Sold out";
  if (p.uniqueness === "unique") return "One of a kind";
  return null;
}
