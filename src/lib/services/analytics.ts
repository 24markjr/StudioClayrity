/**
 * Analytics boundary. Events carry no personal data (no names, emails, phones or
 * addresses). The real provider (GA4 or Plausible) is wired up in Phase 12, after consent.
 */

export type CommerceEvent =
  | { name: "view_item"; productId: string; value: number }
  | { name: "view_item_list"; listId: string }
  | { name: "search"; query: string; resultCount: number }
  | { name: "add_to_cart" | "remove_from_cart"; variantId: string; quantity: number; value: number }
  | { name: "add_to_wishlist"; productId: string }
  | { name: "begin_checkout"; value: number; itemCount: number }
  | { name: "purchase"; orderId: string; value: number; tax: number; shipping: number; coupon?: string }
  | { name: "payment_failed"; orderId: string }
  | { name: "enquiry_submit"; type: string }
  | { name: "newsletter_signup" };

export interface AnalyticsProvider {
  readonly name: string;
  track(event: CommerceEvent): Promise<void>;
}

export class NoopAnalytics implements AnalyticsProvider {
  readonly name = "noop";
  async track() {}
}
