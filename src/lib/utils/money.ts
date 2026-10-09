/**
 * Money is always stored and passed around as integer minor units (paise for INR).
 * Formatting is the only place it becomes a decimal.
 */

export type CurrencyCode = "INR";

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: CurrencyCode, showPaise: boolean) {
  const key = `${currency}:${showPaise}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: showPaise ? 2 : 0,
      maximumFractionDigits: showPaise ? 2 : 0,
    });
    formatters.set(key, f);
  }
  return f;
}

/**
 * Format minor units for display, e.g. 850000 → "₹8,500".
 * Paise are shown only when the amount is not a whole rupee.
 */
export function formatMoney(minor: number, currency: CurrencyCode = "INR") {
  if (!Number.isSafeInteger(minor)) {
    throw new TypeError(`formatMoney expects integer minor units, received ${minor}`);
  }
  const showPaise = minor % 100 !== 0;
  return formatter(currency, showPaise).format(minor / 100);
}

/** Convert whole rupees (e.g. from a CSV import) to paise without floating-point drift. */
export function rupeesToPaise(rupees: string | number) {
  const text = String(rupees).trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new TypeError(`Invalid rupee amount: ${rupees}`);
  }
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
