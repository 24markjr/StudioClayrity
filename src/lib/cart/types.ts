import type { ShippingEstimate } from "../domain/shipping-rules";

export type BagLine = {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  variantName: string | null;
  sku: string;
  image: { src: string; alt: string } | null;
  /** Current price in paise — never the price when added */
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  /** Most this line can hold right now (1 for one-of-a-kind pieces) */
  maxQuantity: number;
  uniqueness: "unique" | "stock" | "made_to_order";
  leadTimeDays: number | null;
  /** Unavailable lines stay visible (so the shopper knows) but don't count toward totals */
  available: boolean;
};

export type BagNotice = {
  kind: "price_changed" | "quantity_reduced" | "unavailable" | "coupon_removed";
  message: string;
  variantId?: string;
};

export type BagView = {
  lines: BagLine[];
  /** Pieces that can be bought now */
  itemCount: number;
  subtotal: number;
  coupon: { code: string; discount: number; description: string | null } | null;
  giftWrap: { offered: boolean; selected: boolean; price: number };
  giftMessage: string | null;
  hidePrices: boolean;
  pincode: string | null;
  shipping: ShippingEstimate;
  /** Subtotal − discount + gift wrap + shipping (when quoted) */
  total: number;
  notices: BagNotice[];
};

export const EMPTY_BAG: BagView = {
  lines: [],
  itemCount: 0,
  subtotal: 0,
  coupon: null,
  giftWrap: { offered: false, selected: false, price: 0 },
  giftMessage: null,
  hidePrices: false,
  pincode: null,
  shipping: { status: "unconfirmed" },
  total: 0,
  notices: [],
};

/** Per-line ceiling for made-to-order pieces (no stock limit, but a sane order size). */
export const MAX_LINE_QUANTITY = 10;
