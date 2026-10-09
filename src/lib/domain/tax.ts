/**
 * GST helpers. Indian retail prices are GST-inclusive, so tax is *extracted* from the
 * amount the customer pays rather than added on top.
 *
 * Rates are in basis points (1800 = 18%). All amounts are integer paise.
 * ⚠ Rates, HSN codes and the treatment of shipping/gift wrap must be confirmed by the
 *   owner's CA before launch.
 */

/** Tax contained in a GST-inclusive amount, rounded to the nearest paisa. */
export function extractInclusiveTax(grossInclusive: number, rateBp: number) {
  assertMinor(grossInclusive);
  if (!Number.isInteger(rateBp) || rateBp < 0 || rateBp > 2800) {
    throw new RangeError(`Invalid GST rate: ${rateBp} bp`);
  }
  if (rateBp === 0 || grossInclusive === 0) return 0;
  return Math.round((grossInclusive * rateBp) / (10000 + rateBp));
}

/** Supply within the seller's state → CGST + SGST; otherwise IGST. */
export function isIntraState(sellerStateCode: string, placeOfSupplyStateCode: string) {
  return sellerStateCode === placeOfSupplyStateCode;
}

export type GstSplit = { cgst: number; sgst: number; igst: number };

/**
 * Split a tax amount. CGST and SGST are equal halves; an odd paisa goes to SGST so the
 * parts always add back up to the total exactly.
 */
export function splitGst(tax: number, intraState: boolean): GstSplit {
  assertMinor(tax);
  if (!intraState) return { cgst: 0, sgst: 0, igst: tax };
  const cgst = Math.floor(tax / 2);
  return { cgst, sgst: tax - cgst, igst: 0 };
}

function assertMinor(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`Expected a non-negative integer amount in paise, received ${value}`);
  }
}
