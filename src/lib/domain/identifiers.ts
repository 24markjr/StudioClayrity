import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** No 0/O, 1/I/L — easy to read aloud and type from an email. */
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Customer-facing order reference, e.g. "SC-7K3Q9X". Random (≈ 887M combinations), so
 * references can't be guessed by counting. Uniqueness is enforced by the database; callers
 * retry on the rare collision.
 */
export function generateOrderRef(length = 6) {
  let ref = "";
  for (let i = 0; i < length; i++) ref += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return `SC-${ref}`;
}

/** URL-safe random token (cart cookies, guest order links, unsubscribe links). */
export function generateToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/** Tokens are stored hashed, so a database leak doesn't expose usable links. */
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison of a presented token against a stored hash. */
export function tokenMatchesHash(token: string, storedHash: string) {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** "Nero Marble Bowl — Large" → "nero-marble-bowl-large" */
export function slugify(input: string) {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/**
 * Indian financial year (April–March) for a date, in IST. 9 Oct 2026 → "26-27";
 * 15 Feb 2027 → "26-27"; 1 Apr 2027 → "27-28".
 */
export function financialYear(date: Date) {
  // Shift to IST (UTC+5:30) so a payment at 00:30 IST on 1 April counts in the new year
  const ist = new Date(date.getTime() + 330 * 60 * 1000);
  const year = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? year : year - 1;
  const two = (n: number) => String(n % 100).padStart(2, "0");
  return `${two(start)}-${two(start + 1)}`;
}

/** GST invoice number, e.g. "SC/26-27/0001". Max 16 characters as required by GST rules. */
export function formatInvoiceNumber(fy: string, sequence: number) {
  if (!Number.isInteger(sequence) || sequence < 1) throw new RangeError("Invalid invoice sequence");
  const number = `SC/${fy}/${String(sequence).padStart(4, "0")}`;
  if (number.length > 16) throw new RangeError("Invoice number exceeds 16 characters");
  return number;
}
