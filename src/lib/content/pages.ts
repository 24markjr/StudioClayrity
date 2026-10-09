/** Policy pages served at /policies/<slug>; content lives in the `pages` table. */
export const POLICY_PAGES = [
  { slug: "shipping", title: "Shipping policy" },
  { slug: "returns", title: "Returns and refunds" },
  { slug: "cancellation", title: "Cancellation policy" },
  { slug: "privacy", title: "Privacy policy" },
  { slug: "terms", title: "Terms and conditions" },
  { slug: "cookies", title: "Cookie policy" },
] as const;

export type PolicySlug = (typeof POLICY_PAGES)[number]["slug"];

export function isPolicySlug(slug: string): slug is PolicySlug {
  return POLICY_PAGES.some((p) => p.slug === slug);
}
