/**
 * Features switched on as their phase lands. While a flag is off, its UI is hidden rather
 * than shown as a button that does nothing.
 *
 * bag        Phase 5    bag drawer and page, "Add to bag", coupons, gift options
 * checkout   Phase 6    "Checkout" in the bag, "Buy now" (catalogue mode until then)
 * wishlist   Phase 5    hearts on cards and the PDP, /wishlist
 * accounts   Phase 9    sign-in, account icon
 * enquiries  Phase 10   bespoke page, "Request more photos", "Book a video viewing"
 *
 * ⚠ Before going live, enable `bag` only together with `checkout`, so shoppers never fill a
 *   bag they can't pay for.
 */
export const features = {
  bag: true,
  checkout: true,
  wishlist: true,
  accounts: false,
  enquiries: false,
} as const;

/** Sample data is labelled everywhere except production. */
export function showSampleLabels() {
  return process.env.APP_ENV !== "production";
}
