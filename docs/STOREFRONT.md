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

## Catalogue mode

Until checkout ships, [src/lib/features.ts](../src/lib/features.ts) keeps these off and their UI hidden:

| Flag        | Phase | While off                                                                                          |
| ----------- | ----- | -------------------------------------------------------------------------------------------------- |
| `ordering`  | 5–6   | "Add to bag" is disabled with "Online ordering opens soon"; WhatsApp link shown if a number is set |
| `wishlist`  | 5     | No hearts                                                                                          |
| `accounts`  | 9     | No account icon                                                                                    |
| `enquiries` | 10    | No bespoke section, no "request photos / video viewing"                                            |

Sample products show a "Sample" badge everywhere except production.

## Editable content

Homepage copy and images, announcement bar, contact details (incl. WhatsApp and grievance officer), social links and seller details are store settings with safe defaults ([src/lib/domain/settings.ts](../src/lib/domain/settings.ts)), editable in the admin (Phase 8). Footer items appear only once they have a value.

## Forms

Newsletter (explicit consent required) and "notify me when available" are server actions with Zod validation and a honeypot field. Responses never reveal whether an email was already known. Typed values survive a validation error.

## Known limitations

- **First visit to a never-seen URL returns HTTP 200** even when it ends in a 404 or redirect, because the page streams before the product lookup finishes. Visitors still see the right page (redirects happen in the browser), and later requests — including search-engine crawlers — get the correct 404/308.
- Deferred to later phases: delivery-pincode checker and delivery dates (Shiprocket, Phase 7), "No-cost EMI" line (needs Razorpay EMI approval), mobile sticky add-to-bag bar (with ordering, Phase 5), sitemap and robots.txt (Phase 10), real photography (owner).
