import { inArray } from "drizzle-orm";
import { buildBagView, evaluateCartCoupon } from "../cart/service";
import type { BagNotice } from "../cart/types";
import type { Database } from "../db/create";
import { carts, products } from "../db/schema";
import { priceOrder } from "../domain/pricing";
import { getSetting, type SettingValue } from "../domain/settings";
import { estimateShipping, type ShippingMethod } from "../domain/shipping-rules";
import type { PaymentMethod } from "./schema";

/**
 * The checkout quote: everything the customer will pay, priced on the server from the
 * database. Placing an order re-runs this inside the same request — nothing from the
 * browser is trusted.
 */

export type CheckoutSettings = {
  shipping: SettingValue<"shipping">;
  gifting: SettingValue<"gifting">;
  cod: SettingValue<"cod">;
  seller: SettingValue<"seller">;
  checkout: SettingValue<"checkout">;
};

export async function loadCheckoutSettings(db: Database): Promise<CheckoutSettings> {
  const [shipping, gifting, cod, seller, checkout] = await Promise.all([
    getSetting(db, "shipping"),
    getSetting(db, "gifting"),
    getSetting(db, "cod"),
    getSetting(db, "seller"),
    getSetting(db, "checkout"),
  ]);
  return { shipping, gifting, cod, seller, checkout };
}

export type Readiness = { ready: true; paymentMethods: PaymentMethod[] } | { ready: false; reason: string };

/** Can the store take orders at all right now? Each gap has a plain explanation. */
export function checkoutReadiness(
  settings: CheckoutSettings,
  options: { paymentsConfigured: boolean; appEnv: string | undefined },
): Readiness {
  if (!settings.shipping.ratesConfirmed) {
    return { ready: false, reason: "Shipping rates are still being finalised, so checkout isn't open yet." };
  }
  if (options.appEnv === "production" && !settings.seller.isConfirmed) {
    return { ready: false, reason: "Checkout will open once the store's tax details are confirmed." };
  }
  const paymentMethods: PaymentMethod[] = [];
  if (options.paymentsConfigured) paymentMethods.push("razorpay");
  if (settings.cod.enabled) paymentMethods.push("cod");
  if (paymentMethods.length === 0) {
    return { ready: false, reason: "Online payments aren't set up yet, so checkout isn't open." };
  }
  return { ready: true, paymentMethods };
}

export type QuoteLine = {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  variantName: string | null;
  sku: string;
  image: { src: string; alt: string } | null;
  unitPrice: number;
  quantity: number;
  discount: number;
  lineTotal: number;
  gstRateBp: number;
  hsnCode: string | null;
  tax: number;
};

export type Quote = {
  lines: QuoteLine[];
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  giftWrapTotal: number;
  codFee: number;
  total: number;
  taxTotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  intraState: boolean;
  coupon: { id: string; code: string; discount: number } | null;
  /** Why a code in the bag doesn't apply at checkout (e.g. already used by this email) */
  couponMessage: string | null;
  shippingOptions: Array<{ method: ShippingMethod; amount: number }>;
  shippingMethod: ShippingMethod;
  cod: { available: boolean; fee: number; reason: string | null };
  gift: { wrap: boolean; message: string | null; hidePrices: boolean };
  /** Changes the shopper should know about (price changed, quantity reduced…) */
  notices: BagNotice[];
  /** Anything that stops the order being placed */
  problems: string[];
};

export async function buildQuote(
  db: Database,
  cart: typeof carts.$inferSelect,
  settings: CheckoutSettings,
  params: {
    email?: string;
    placeOfSupplyStateCode: string;
    shippingMethod: ShippingMethod;
    paymentMethod: PaymentMethod;
  },
): Promise<Quote> {
  const bag = await buildBagView(db, cart, { shipping: settings.shipping, gifting: settings.gifting });
  const problems: string[] = [];
  const buyable = bag.lines.filter((l) => l.available);
  if (bag.lines.length === 0) problems.push("Your bag is empty.");
  if (bag.lines.some((l) => !l.available)) problems.push("Remove the pieces that are no longer available.");

  // Tax details per product — required for a GST invoice
  const taxRows = buyable.length
    ? await db
        .select({ id: products.id, gstRateBp: products.gstRateBp, hsnCode: products.hsnCode })
        .from(products)
        .where(inArray(products.id, [...new Set(buyable.map((l) => l.productId))]))
    : [];
  const tax = new Map(taxRows.map((r) => [r.id, r]));
  for (const line of buyable) {
    if (tax.get(line.productId)?.gstRateBp == null) {
      problems.push(`${line.name} can't be ordered online yet.`);
    }
  }

  // Coupon, now with the shopper's email for per-customer limits
  let coupon: Quote["coupon"] = null;
  let couponMessage: string | null = null;
  let eligible: Set<string> | null = null;
  if (cart.couponId && buyable.length) {
    const evaluated = await evaluateCartCoupon(db, cart.couponId, buyable, bag.subtotal, {
      email: params.email,
    });
    if (evaluated.ok) {
      coupon = { id: evaluated.coupon.id, code: evaluated.coupon.code, discount: evaluated.coupon.discount };
      eligible = evaluated.eligibleProductIds;
    } else {
      couponMessage = evaluated.message;
    }
  }
  const discount = coupon?.discount ?? 0;
  const afterDiscount = bag.subtotal - discount;

  // Shipping
  const shippingOptions: Quote["shippingOptions"] = [];
  for (const method of ["standard", "express"] as const) {
    const estimate = estimateShipping(settings.shipping, afterDiscount, method);
    if (estimate.status === "quoted") shippingOptions.push({ method, amount: estimate.amount });
  }
  const chosen = shippingOptions.find((o) => o.method === params.shippingMethod) ?? shippingOptions[0];
  if (!chosen && buyable.length) problems.push("Shipping isn't available yet.");
  const shippingTotal = chosen?.amount ?? 0;

  const giftWrapTotal = settings.gifting.wrapEnabled && cart.giftWrap ? settings.gifting.wrapPrice : 0;

  // Cash on delivery: optional, capped by order value
  const totalBeforeCod = afterDiscount + shippingTotal + giftWrapTotal;
  const codReason = !settings.cod.enabled
    ? "Cash on delivery isn't offered."
    : totalBeforeCod > settings.cod.maxOrderTotal
      ? "Cash on delivery isn't available for orders of this value."
      : null;
  const codFee = params.paymentMethod === "cod" && !codReason ? settings.cod.fee : 0;
  if (params.paymentMethod === "cod" && codReason) problems.push(codReason);

  const priced = priceOrder({
    lines: buyable.map((l) => ({
      key: l.variantId,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      gstRateBp: tax.get(l.productId)?.gstRateBp ?? 0,
      discountEligible: eligible ? eligible.has(l.productId) : true,
    })),
    discount,
    shipping: shippingTotal,
    giftWrap: giftWrapTotal,
    codFee,
    chargesGstRateBp: settings.shipping.chargesGstRateBp,
    sellerStateCode: settings.seller.stateCode,
    placeOfSupplyStateCode: params.placeOfSupplyStateCode,
  });

  const lines: QuoteLine[] = priced.lines.map((p) => {
    const line = buyable.find((l) => l.variantId === p.key)!;
    return {
      variantId: line.variantId,
      productId: line.productId,
      slug: line.slug,
      name: line.name,
      variantName: line.variantName,
      sku: line.sku,
      image: line.image,
      unitPrice: p.unitPrice,
      quantity: p.quantity,
      discount: p.discount,
      lineTotal: p.lineTotal,
      gstRateBp: p.gstRateBp,
      hsnCode: tax.get(line.productId)?.hsnCode ?? null,
      tax: p.tax,
    };
  });

  return {
    lines,
    subtotal: priced.subtotal,
    discountTotal: priced.discountTotal,
    shippingTotal: priced.shippingTotal,
    giftWrapTotal: priced.giftWrapTotal,
    codFee: priced.codFee,
    total: priced.total,
    taxTotal: priced.taxTotal,
    cgst: priced.cgst,
    sgst: priced.sgst,
    igst: priced.igst,
    intraState: priced.intraState,
    coupon,
    couponMessage,
    shippingOptions,
    shippingMethod: chosen?.method ?? "standard",
    cod: { available: !codReason, fee: settings.cod.fee, reason: codReason },
    gift: { wrap: giftWrapTotal > 0, message: cart.giftMessage, hidePrices: cart.hidePrices },
    notices: bag.notices,
    problems,
  };
}
