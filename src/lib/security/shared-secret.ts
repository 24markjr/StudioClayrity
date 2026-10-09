import { timingSafeEqual } from "node:crypto";

/** Constant-time comparison of a presented secret (header) with the configured one. */
export function matchesSecret(presented: string | null | undefined, expected: string | undefined) {
  if (!expected || !presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
