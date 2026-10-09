# Storefront

## Routes

| Route                                 | Page                                                                                               | Rendering                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `/`                                   | Homepage — hero, collections, curated pieces, philosophy, material, editorial, gifting, newsletter | Static, refreshed every minute                               |
| `/shop`                               | All pieces with filters and sort                                                                   | Static shell; results stream per filter set                  |
| `/shop/[category]`                    | Category listing                                                                                   | Pre-rendered per category                                    |
| `/collections`, `/collections/[slug]` | Collections index and collection listing                                                           | Pre-rendered                                                 |
| `/products/[slug]`                    | Product page                                                                                       | Pre-rendered per product; new products render on first visit |
| `/search?q=`                          | Full search results (not indexed)                                                                  | Streams per query                                            |
| `/about`, `/policies/[slug]`          | Owner-edited pages (`pages` table)                                                                 | Pre-rendered                                                 |
| `/api/search?q=`                      | Suggestions for the search overlay (top 6)                                                         | Dynamic, cached 60 s at the edge                             |

Filters live in the URL (`?material=Marble&type=unique&min=5000&stock=1&sort=price_asc&page=2`), so any view can be shared or bookmarked. Parsing is strict ([src/lib/catalog/filters.ts](../src/lib/catalog/filters.ts)).

## Data and caching

Pages call cached functions in [src/lib/catalog/data.ts](../src/lib/catalog/data.ts), which wrap plain queries in [repository.ts](../src/lib/catalog/repository.ts) (integration-tested). Cache tags:

| Tag              | Refresh when                                                               |
| ---------------- | -------------------------------------------------------------------------- |
| `catalog`        | Any product, collection or category change (admin, Phase 8)                |
| `product:<slug>` | One product's price, stock or content changes (admin; checkout in Phase 6) |
| `settings`       | Store settings or pages change                                             |

Stock on listing and product pages may be up to a few minutes old. The bag and checkout always re-read it live.

**A database is needed at build time** — the build pre-renders the catalogue. CI seeds sample data first; Vercel builds use the real database.

## Feature switches

[src/lib/features.ts](../src/lib/features.ts) turns features on as their phase lands; while off, their UI is hidden.

| Flag        | Phase | State | While off                                                                                           |
| ----------- | ----- | ----- | --------------------------------------------------------------------------------------------------- |
| `bag`       | 5     | on    | "Add to bag" disabled with "Online ordering opens soon"                                             |
| `checkout`  | 6     | off   | The bag shows a disabled Checkout button: "Checkout opens soon. Your bag will be kept for 30 days." |
| `wishlist`  | 5     | on    | No hearts, no /wishlist                                                                             |
| `accounts`  | 9     | off   | No account icon                                                                                     |
| `enquiries` | 10    | off   | No bespoke section, no "request photos / video viewing"                                             |

⚠ Before launch, enable `bag` only together with `checkout`.

Sample products show a "Sample" badge everywhere except production.

## Bag

- Stored in the database (`carts`, `cart_items`), found by the SHA-256 hash of an httpOnly `sc_bag` cookie (30 days, extended on every change). No personal data until checkout.
- **Re-validated on every read** ([src/lib/cart/service.ts](../src/lib/cart/service.ts)): current prices (a change is announced once), stock after holds for unpaid orders, unpublished products, and the coupon. Quantities are corrected and the shopper is told why. Lines that can no longer be bought stay visible but don't count.
- One-of-a-kind pieces are limited to 1; made-to-order to 10 per line.
- Coupons are checked against dates, usage limits, minimum order and scope (products/collections), with specific messages. Per-customer limits need an email, so they're checked again at checkout.
- Gift options: "This is a gift" → gift wrap (only if enabled in settings, priced from settings), hide prices on the packing slip, gift message (max 200 characters, also enforced in the database).
- Shipping shows "Calculated at checkout" until the owner sets `shipping.ratesConfirmed`; then the flat rate and free-shipping threshold apply, with an "Add ₹X more for free shipping" line.
- UI: drawer (opens on add) and `/bag` page. Quantity and remove are optimistic and reconciled with the server's re-validated bag; changes are announced to screen readers. On mobile product pages a sticky add-to-bag bar appears after scrolling past the main button.
- `mergeCarts` (combine a guest bag into the customer's bag on sign-in) is implemented and tested; it's wired up with accounts in Phase 9.

## Wishlist

Hearts on every product card and "Save" on product pages; `/wishlist` lists saved pieces (unpublished ones drop out). Stored by an httpOnly `sc_wishlist` cookie (1 year); `mergeWishlists` combines it with the account on sign-in (Phase 9).

## Editable content

Homepage copy and images, announcement bar, contact details (incl. WhatsApp and grievance officer), social links and seller details are store settings with safe defaults ([src/lib/domain/settings.ts](../src/lib/domain/settings.ts)), editable in the admin (Phase 8). Footer items appear only once they have a value.

## Forms

Newsletter (explicit consent required) and "notify me when available" are server actions with Zod validation and a honeypot field. Responses never reveal whether an email was already known. Typed values survive a validation error.

## Known limitations

- **First visit to a never-seen URL returns HTTP 200** even when it ends in a 404 or redirect, because the page streams before the product lookup finishes. Visitors still see the right page (redirects happen in the browser), and later requests — including search-engine crawlers — get the correct 404/308.
- Deferred to later phases: delivery-pincode checker and delivery dates in the bag and on product pages (Shiprocket, Phase 7), "No-cost EMI" line (needs Razorpay EMI approval), abandoned-bag emails (V2), sitemap and robots.txt (Phase 10), real photography (owner).
