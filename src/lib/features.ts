/**
 * Features switched on as their phase lands. While a flag is off, its UI is hidden rather
 * than shown as a button that does nothing.
 *
 * ordering   Phase 5–6  bag, checkout, "Add to bag" (catalogue mode until then)
 * wishlist   Phase 5    hearts on cards and the PDP, /wishlist
 * accounts   Phase 9    sign-in, account icon
 * enquiries  Phase 10   bespoke page, "Request more photos", "Book a video viewing"
 */
export const features = {
  ordering: false,
  wishlist: false,
  accounts: false,
  enquiries: false,
} as const;

/** Sample data is labelled everywhere except production. */
export function showSampleLabels() {
  return process.env.APP_ENV !== "production";
}
