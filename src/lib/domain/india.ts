/**
 * Indian states and union territories with their GST state codes (first two digits of a
 * GSTIN). Used for addresses, place of supply and the CGST/SGST vs IGST decision.
 */
export const INDIAN_STATES = [
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "18", name: "Assam" },
  { code: "10", name: "Bihar" },
  { code: "04", name: "Chandigarh" },
  { code: "22", name: "Chhattisgarh" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "07", name: "Delhi" },
  { code: "30", name: "Goa" },
  { code: "24", name: "Gujarat" },
  { code: "06", name: "Haryana" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "01", name: "Jammu and Kashmir" },
  { code: "20", name: "Jharkhand" },
  { code: "29", name: "Karnataka" },
  { code: "32", name: "Kerala" },
  { code: "38", name: "Ladakh" },
  { code: "31", name: "Lakshadweep" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "27", name: "Maharashtra" },
  { code: "14", name: "Manipur" },
  { code: "17", name: "Meghalaya" },
  { code: "15", name: "Mizoram" },
  { code: "13", name: "Nagaland" },
  { code: "21", name: "Odisha" },
  { code: "34", name: "Puducherry" },
  { code: "03", name: "Punjab" },
  { code: "08", name: "Rajasthan" },
  { code: "11", name: "Sikkim" },
  { code: "33", name: "Tamil Nadu" },
  { code: "36", name: "Telangana" },
  { code: "16", name: "Tripura" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "05", name: "Uttarakhand" },
  { code: "19", name: "West Bengal" },
] as const;

export type StateCode = (typeof INDIAN_STATES)[number]["code"];

const byCode = new Map<string, string>(INDIAN_STATES.map((s) => [s.code, s.name]));

export function isStateCode(code: string): code is StateCode {
  return byCode.has(code);
}

export function stateName(code: string) {
  return byCode.get(code) ?? null;
}

/** Indian PIN codes: 6 digits, first digit 1–9. */
export function isValidPincode(pincode: string) {
  return /^[1-9][0-9]{5}$/.test(pincode);
}

/** Indian mobile numbers: 10 digits starting 6–9, optional +91 / 0 prefix and spaces. */
export function normaliseIndianMobile(input: string) {
  const digits = input.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/**
 * Structural GSTIN check: 2-digit state code, 10-char PAN, entity number, "Z", checksum.
 * The checksum itself is verified with the official mod-36 algorithm.
 */
export function isValidGstin(gstin: string) {
  const value = gstin.trim().toUpperCase();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value)) return false;
  if (!isStateCode(value.slice(0, 2))) return false;
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = chars.indexOf(value[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  const check = chars[(36 - (sum % 36)) % 36];
  return value[14] === check;
}
