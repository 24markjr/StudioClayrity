import { extractInclusiveTax, isIntraState, splitGst, type GstSplit } from "./tax";

/**
 * Order totals, computed only on the server from database prices. Client-submitted
 * amounts are never used.
 *
 *   total = subtotal − discount + shipping + gift wrap + COD fee
 *
 * Every amount is GST-inclusive; the tax figures are what is contained within them.
 */

export type PricingLine = {
  /** Stable key (variant id) so callers can map results back */
  key: string;
  unitPrice: number;
  quantity: number;
  gstRateBp: number;
  /** Whether a coupon scoped to products/collections applies to this line */
  discountEligible?: boolean;
};

export type PricingInput = {
  lines: PricingLine[];
  /** Order-level discount in paise (already capped by the coupon rules) */
  discount?: number;
  shipping?: number;
  giftWrap?: number;
  codFee?: number;
  /** GST rate applied to shipping, gift wrap and COD fee */
  chargesGstRateBp: number;
  sellerStateCode: string;
  placeOfSupplyStateCode: string;
};

export type PricedLine = PricingLine & {
  gross: number;
  discount: number;
  lineTotal: number;
  tax: number;
};

export type PricingResult = {
  lines: PricedLine[];
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  giftWrapTotal: number;
  codFee: number;
  total: number;
  taxTotal: number;
  intraState: boolean;
} & GstSplit;

/**
 * Spread `amount` across `weights` proportionally, using the largest-remainder method so
 * the parts are whole paise and add up to `amount` exactly.
 */
export function allocateProportionally(amount: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (amount === 0 || totalWeight === 0) return weights.map(() => 0);
  const exact = weights.map((w) => (amount * w) / totalWeight);
  const floors = exact.map(Math.floor);
  let remainder = amount - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (remainder === 0) break;
    floors[index] += 1;
    remainder -= 1;
  }
  return floors;
}

export function priceOrder(input: PricingInput): PricingResult {
  const shipping = input.shipping ?? 0;
  const giftWrap = input.giftWrap ?? 0;
  const codFee = input.codFee ?? 0;
  for (const [name, value] of Object.entries({ shipping, giftWrap, codFee, discount: input.discount ?? 0 })) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new RangeError(`${name} must be a non-negative integer`);
  }
  for (const line of input.lines) {
    if (!Number.isSafeInteger(line.unitPrice) || line.unitPrice < 0)
      throw new RangeError("Invalid unit price");
    if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new RangeError("Invalid quantity");
  }

  const grosses = input.lines.map((l) => l.unitPrice * l.quantity);
  const subtotal = grosses.reduce((a, b) => a + b, 0);
  const eligibleWeights = input.lines.map((l, i) => (l.discountEligible === false ? 0 : grosses[i]));
  const eligibleTotal = eligibleWeights.reduce((a, b) => a + b, 0);
  // A discount can never exceed what it applies to
  const discountTotal = Math.min(input.discount ?? 0, eligibleTotal);
  const lineDiscounts = allocateProportionally(discountTotal, eligibleWeights);

  const intraState = isIntraState(input.sellerStateCode, input.placeOfSupplyStateCode);

  const lines: PricedLine[] = input.lines.map((line, i) => {
    const lineTotal = grosses[i] - lineDiscounts[i];
    return {
      ...line,
      gross: grosses[i],
      discount: lineDiscounts[i],
      lineTotal,
      tax: extractInclusiveTax(lineTotal, line.gstRateBp),
    };
  });

  const chargesTax = extractInclusiveTax(shipping + giftWrap + codFee, input.chargesGstRateBp);
  const taxTotal = lines.reduce((sum, l) => sum + l.tax, 0) + chargesTax;
  const total = subtotal - discountTotal + shipping + giftWrap + codFee;

  return {
    lines,
    subtotal,
    discountTotal,
    shippingTotal: shipping,
    giftWrapTotal: giftWrap,
    codFee,
    total,
    taxTotal,
    intraState,
    ...splitGst(taxTotal, intraState),
  };
}
