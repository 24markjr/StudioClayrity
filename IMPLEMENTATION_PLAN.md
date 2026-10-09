# Studio Clayrity — Implementation Plan

**Domain:** studioclayrity.com
**Direction:** Quiet luxury (warm ivory, stone, editorial serif)
**Stack:** Next.js + custom backend
**Catalogue:** Starting from scratch
**Market:** India first, with an architecture that can support international customers later

Legend: **[MVP]** = required for launch · **[V2]** = after launch · **⚠ Client** = blocked on information or access from the owner

---

## 0. Assumptions (confirm or correct before Phase 1)

| #   | Assumption                                                                                                         | Affects                            |
| --- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| A1  | She sells high-value decor objects (marble, possibly clay/ceramic). Material is a data field and is not hardcoded. | Data model, copy                   |
| A2  | Price range is roughly ₹2,000–₹60,000 per item.                                                                    | EMI, COD rules, shipping insurance |
| A3  | Some pieces are one-of-a-kind. Some are made to order with a lead time.                                            | Inventory model, PDP               |
| A4  | The business is GST-registered and ships within India only at launch.                                              | Tax engine, invoices               |
| A5  | COD is off at launch. It can be enabled later, capped at a maximum order value.                                    | Checkout                           |
| A6  | No logo exists yet. We design a typographic wordmark.                                                              | Phase 2                            |
| A7  | One owner/admin at launch. Staff roles come later.                                                                 | Auth                               |

---

## 1. Final technology stack

| Concern          | Choice                                                                        | Notes                                                 |
| ---------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| Framework        | Next.js (App Router), React, TypeScript strict                                | Server Components by default                          |
| Styling          | Tailwind CSS + design tokens (CSS variables)                                  |                                                       |
| Motion           | Motion for React                                                              | GSAP only if one specific scroll timeline needs it    |
| Forms            | React Hook Form + Zod                                                         | The same Zod schemas validate on the server           |
| Database         | PostgreSQL on Supabase (Mumbai, ap-south-1)                                   | Point-in-time recovery on a paid tier                 |
| ORM / migrations | Drizzle ORM + drizzle-kit                                                     | Typed SQL, simple transactions                        |
| Auth             | Supabase Auth: email OTP for customers, email + password + TOTP 2FA for admin | Phone OTP in V2 (needs an SMS provider such as MSG91) |
| Images           | Cloudinary                                                                    | Responsive transforms, zoom crops, signed uploads     |
| Payments         | Razorpay (Orders API + Checkout + Webhooks + Payment Links)                   | UPI, cards, netbanking, wallets, EMI                  |
| Email            | Resend + React Email templates                                                | Sent from `orders@studioclayrity.com`                 |
| Shipping         | Shiprocket API (rates, serviceability, AWB, tracking webhooks)                | Manual tracking entry as a fallback                   |
| Search           | Postgres full-text search + `pg_trgm` for fuzzy matching                      | Enough for fewer than ~5,000 SKUs                     |
| Rate limiting    | Upstash Redis                                                                 | Login, OTP, contact, coupon, checkout                 |
| Spam protection  | Cloudflare Turnstile                                                          | Contact, newsletter, enquiry forms                    |
| Background jobs  | Vercel Cron + idempotent route handlers                                       | Reservation expiry, abandoned carts                   |
| Monitoring       | Sentry (errors), Vercel Analytics (web vitals)                                | Personal data scrubbed                                |
| Analytics        | GA4 or Plausible, loaded only after consent                                   |                                                       |
| Testing          | Vitest (unit/integration), Playwright (end-to-end)                            |                                                       |
| Hosting          | Vercel (production + preview), GitHub repo, GitHub Actions CI                 |                                                       |
| DNS / email      | Cloudflare DNS; Google Workspace or Zoho for the mailbox                      | SPF, DKIM and DMARC records                           |

---

## Phase 0 — Discovery, accounts and content onboarding

**Goal:** remove every external blocker before code depends on it. Several of these approvals take days or weeks, so start them on day 1.

### 0.1 Client questionnaire ⚠ Client

- Brand: display name and spelling, tagline, logo files (if any), story, founder details (only what she approves)
- Materials sold: marble, clay, ceramic or other. Origins and processes she can **verify**.
- Price range, typical order value, and the most expensive item
- One-of-a-kind vs repeatable vs made-to-order (with lead times)
- Custom/bespoke commissions: yes or no
- GSTIN, legal entity name, registered address, HSN codes per product type (from her CA)
- Shipping: pickup address, packaging method, packed weights/dimensions, serviceable regions, insurance
- Policies: returns window, breakage claims (unboxing video?), cancellations, refund timelines
- COD: yes, no, or capped at ₹X
- Contact: email, phone, WhatsApp number, business hours
- Social handles
- Grievance officer name and contact (legal requirement)

### 0.2 Accounts and access (start immediately)

- [ ] Domain DNS moved to Cloudflare (or kept with the registrar, with access shared)
- [ ] Business mailbox: `hello@`, `orders@`, `support@`
- [ ] **Razorpay merchant account + KYC** ⚠ Client (can take 3–10 days). Request EMI and Payment Links activation.
- [ ] Supabase project (Mumbai), with staging and production databases
- [ ] Vercel team + GitHub repository
- [ ] Cloudinary account
- [ ] Resend account + domain verification (SPF/DKIM)
- [ ] Shiprocket account + KYC + pickup address ⚠ Client
- [ ] Upstash, Sentry, and Cloudflare Turnstile keys
- [ ] Google Search Console + analytics property

### 0.3 Content onboarding kit

- **Product data template** (Google Sheet / CSV) with columns matching the database: name, category, collection(s), material, finish, colour, dimensions (L×W×H cm), net weight, packed weight, packed dimensions, price (₹), compare-at price, stock, uniqueness type, lead time, care notes, HSN, GST rate, SEO notes
- **Photography shot list per product:**
  1. Hero on a neutral background (4:5)
  2. Three angles
  3. Texture/veining macro shot
  4. Scale shot (in hand or beside a known object)
  5. Lifestyle shot in an interior
  6. For one-of-a-kind items: photos of that exact piece
- **Image specs:** at least 3000 px on the long edge, consistent white balance, sRGB, named `slug-01.jpg` and so on
- **Copy pack:** About page, brand philosophy, care guide, FAQ draft

### 0.4 Phase deliverables

- Signed-off answers to 0.1 (or an approved placeholder for each item)
- A credentials checklist (stored in a password manager, **never** in the repo)
- Agreed MVP scope (this document)

---

## Phase 1 — Project foundation

**Goal:** a clean, enforceable codebase skeleton that deploys to Vercel.

### Tasks

- Scaffold Next.js (App Router, TypeScript strict, Tailwind, ESLint, Prettier)
- pnpm workspace and Node version pinned in `.nvmrc`
- Folder structure:

```
src/
  app/
    (store)/            # public storefront routes
    (account)/          # customer account routes
    (checkout)/         # checkout routes (minimal chrome)
    admin/              # admin routes (protected)
    api/                # webhooks, cron, uploads
  components/
    ui/                 # design-system primitives
    store/              # storefront composites
    admin/              # admin composites
  lib/
    db/                 # drizzle schema, client, migrations
    services/           # payment, email, shipping, storage, analytics interfaces
    domain/             # business logic: pricing, tax, inventory, orders, coupons
    validation/         # zod schemas shared by client and server
    auth/               # session helpers, role guards
    utils/
  emails/               # React Email templates
  styles/
tests/
  unit/  integration/  e2e/
```

- Environment validation at boot (`env.ts` with Zod). The app fails fast if a variable is missing.
- `.env.example` with every variable documented
- Husky + lint-staged pre-commit hooks (lint, typecheck)
- GitHub Actions CI on every PR: install → lint → typecheck → unit tests → build
- Vercel project with preview deploys per PR; staging uses the staging database and Razorpay **test** keys
- Base security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy) in `next.config`
- Sentry setup

### Acceptance

- `pnpm build` passes in CI; a preview URL loads; a missing environment variable fails the build with a clear message.

---

## Phase 2 — Brand identity and design system

**Goal:** every later page is assembled from approved, consistent parts.

### 2.1 Brand

- Typographic wordmark "Studio Clayrity" in the display serif, with a monogram variant (favicon, social avatar)
- Brand voice guide: calm, precise, sensory, no hype words, no exclamation marks

### 2.2 Tokens (CSS variables + Tailwind theme)

- **Colour:** ivory `#F7F5F0` (base background), soft white `#FCFBF8`, limestone `#E7E0D5`, taupe `#A69A89`, stone grey `#77736C`, earth brown `#51443A`, charcoal `#272622` (text), border `#E5E0D7`. Semantic: success, error, warning and info, desaturated to suit the palette. Every text/background pair checked for WCAG AA.
- **Type:** Cormorant Garamond (display/headings, 400–600) + Manrope (UI/body, 400–600), self-hosted via `next/font`. Fluid scale with `clamp()`: display, h1–h4, product title, price, body, small, caption, overline, button.
- **Spacing:** 4 px base scale; section rhythm tokens (`section-sm/md/lg`)
- **Grid:** 12 columns on desktop, 6 on tablet, 4 on mobile; gutters 16 / 24 / 32 px; max widths 1440 (content) and 1680 (full-bleed editorial)
- **Radius:** 0–2 px (square, architectural). **Shadows:** almost none; one subtle elevation for drawers.
- **Image ratios:** product 4:5, editorial 3:2 / 16:9, collection 3:4

### 2.3 Motion system

- Durations: `micro 160ms`, `base 240ms`, `overlay 300ms`, `reveal 600ms`
- Easing: `out-quint` for reveals, `in-out-cubic` for drawers, plus a gentle spring for the bag count
- Primitives: `<Reveal>`, `<StaggerText>`, `<MaskImage>`, `<Drawer>`, `<FadePresence>`
- A global `prefers-reduced-motion` fallback (opacity only, or no motion)

### 2.4 Component library (`components/ui`)

Button (primary/secondary/text/icon; loading/disabled), Link, Input, Textarea, Select, Checkbox, Radio, Switch, QuantityStepper, Accordion, Tabs, Dialog, Drawer, Popover, Tooltip, Toast, Badge (restrained), Breadcrumbs, Pagination, Skeleton, EmptyState, ErrorState, Price (formats ₹ from paise), ResponsiveImage (Cloudinary loader, blur placeholder), Divider, VisuallyHidden.

### 2.5 Internal style-guide route

`/_styleguide` (development only) renders every token and component in each state for review.

### Acceptance

- The owner approves the style guide and a static homepage hero mockup before Phase 4 begins.

---

## Phase 3 — Data model and backend foundation

**Goal:** the complete schema, auth and service boundaries, all tested.

### 3.1 Money and tax rules (non-negotiable)

- All amounts are **integers in paise**. No floats anywhere.
- Displayed prices are **GST-inclusive** (Indian retail norm). Tax is extracted per line: `tax = price × rate / (100 + rate)`.
- Intra-state shipping → CGST + SGST (half each). Inter-state → IGST. Decided by the shipping-address state vs the seller's state.
- GST rate and HSN code are stored **per product**, provided by her CA. They are never hardcoded.
- Currency field on prices from day one (`INR`) to support international later.

### 3.2 Schema (Drizzle)

| Table                          | Key fields / notes                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `profiles`                     | id (= auth user), name, email, phone, role (`customer` / `admin` / `staff`), marketing_consent, created_at                                                                                                                                                                                                               |
| `addresses`                    | user_id, name, phone, line1, line2, city, state, pincode, country, is_default                                                                                                                                                                                                                                            |
| `categories`                   | name, slug (unique), description, image, sort, is_active                                                                                                                                                                                                                                                                 |
| `collections`                  | name, slug, intro (rich text), banner, seo_*, sort, is_published                                                                                                                                                                                                                                                         |
| `products`                     | name, slug (unique), short_desc, description, category_id, material, finish, colour, care, hsn_code, gst_rate, **uniqueness_type** (`unique` / `stock` / `made_to_order`), lead_time_days, variation_note, is_featured, status (`draft` / `published` / `archived`), seo_title, seo_desc, timestamps                     |
| `product_images`               | product_id, variant_id?, cloudinary_id, alt, kind (`hero` / `angle` / `detail` / `scale` / `lifestyle`), width, height, sort                                                                                                                                                                                             |
| `product_variants`             | product_id, sku (unique), name, option values (json), price, compare_at_price, weight_g, dims_mm, packed_weight_g, packed_dims_mm, is_default                                                                                                                                                                            |
| `inventory`                    | variant_id (unique), on_hand, reserved, low_stock_threshold                                                                                                                                                                                                                                                              |
| `inventory_adjustments`        | variant_id, delta, reason (`restock` / `sale` / `return` / `damage` / `manual` / `reservation` / `release`), ref, actor_id, created_at                                                                                                                                                                                   |
| `collection_products`          | collection_id, product_id, sort (composite primary key)                                                                                                                                                                                                                                                                  |
| `slug_redirects`               | entity, old_slug, new_slug                                                                                                                                                                                                                                                                                               |
| `carts`                        | id, user_id?, session_token, coupon_id?, updated_at, expires_at                                                                                                                                                                                                                                                          |
| `cart_items`                   | cart_id, variant_id, quantity                                                                                                                                                                                                                                                                                            |
| `wishlists` / `wishlist_items` | user_id or session, product_id                                                                                                                                                                                                                                                                                           |
| `stock_reservations`           | variant_id, cart_id/order_id, qty, expires_at, status                                                                                                                                                                                                                                                                    |
| `orders`                       | **public_ref** (random, e.g. `SC-7K3Q9X`), user_id?, email, phone, status, payment_status, fulfilment_status, subtotal, discount, shipping, tax_total, cgst, sgst, igst, total, currency, shipping_address (json snapshot), billing_address (json), gift_wrap, gift_message, hide_prices, is_test, invoice_no, placed_at |
| `order_items`                  | order_id, variant_id, **snapshot**: name, sku, variant_name, image, unit_price, qty, hsn, gst_rate, tax_amount                                                                                                                                                                                                           |
| `order_events`                 | order_id, from_status, to_status, note, actor, created_at (full audit trail)                                                                                                                                                                                                                                             |
| `payments`                     | order_id, provider, provider_order_id (unique), provider_payment_id (unique), method, amount, status, raw (json, sanitised)                                                                                                                                                                                              |
| `webhook_events`               | provider, event_id (**unique**, for idempotency), type, payload, processed_at                                                                                                                                                                                                                                            |
| `refunds`                      | order_id, payment_id, provider_refund_id, amount, reason, status                                                                                                                                                                                                                                                         |
| `shipments`                    | order_id, carrier, awb, tracking_url, status, shipped_at, delivered_at                                                                                                                                                                                                                                                   |
| `coupons`                      | code (unique, uppercase), type (`percent` / `fixed`), value, min_order, max_discount, starts_at, ends_at, usage_limit, per_customer_limit, scope (`all` / `products` / `collections`), is_active                                                                                                                         |
| `coupon_redemptions`           | coupon_id, order_id, user_id/email                                                                                                                                                                                                                                                                                       |
| `return_requests`              | order_id, items, reason, media, status                                                                                                                                                                                                                                                                                   |
| `enquiries`                    | type (`bespoke` / `more_photos` / `video_call` / `trade` / `general`), product_id?, name, email, phone, message, status                                                                                                                                                                                                  |
| `back_in_stock_requests`       | variant_id, email, notified_at                                                                                                                                                                                                                                                                                           |
| `newsletter_subscribers`       | email (unique), status, consent_at, source, unsubscribe_token                                                                                                                                                                                                                                                            |
| `contact_submissions`          | name, email, phone, order_ref?, message, status                                                                                                                                                                                                                                                                          |
| `store_settings`               | key/value json: announcement bar, hero, homepage sections, footer, contact, social, shipping rules, COD rules, gift-wrap price, seller GSTIN/state                                                                                                                                                                       |
| `pages`                        | slug, title, body (rich text), seo_*, is_published (policies, about)                                                                                                                                                                                                                                                     |
| `audit_logs`                   | actor_id, action, entity, entity_id, diff, ip, created_at                                                                                                                                                                                                                                                                |

Indexes on every foreign key, slug, status, created_at; a GIN index for full-text search; a trigram index on product name.

### 3.3 Auth and authorisation

- Supabase Auth: customers sign in with an email magic link/OTP (no passwords). Admins use email + password + mandatory TOTP.
- Middleware protects `/account/*` and `/admin/*`. **Every** server action and API route also checks the role through `requireUser()` / `requireAdmin()` guards.
- Row Level Security enabled on all tables as defence in depth (anonymous access denied by default; the server uses a service role only inside server code).
- Guest orders can be claimed when the guest later signs up with the same email.

### 3.4 Service interfaces (`lib/services`)

`PaymentProvider`, `EmailProvider`, `ShippingProvider`, `StorageProvider`, `AnalyticsProvider`. Each has a real implementation and a `dev`/`test` implementation that logs safely. The implementation is selected through environment variables.

### 3.5 Seed data (development and staging only)

- 4 categories, 3 collections, 12 sample products labelled **"SAMPLE"**, with placeholder images
- An admin user, coupons, and store settings
- A guard that stops the seed script from running against production

### Acceptance

- Migrations run cleanly from an empty database.
- Unit tests pass for tax extraction, money formatting, coupon maths and role guards.

---

## Phase 4 — Storefront: browsing and discovery [MVP]

### 4.1 Route map

| Route                         | Page                                                     |
| ----------------------------- | -------------------------------------------------------- |
| `/`                           | Home                                                     |
| `/shop`                       | All products                                             |
| `/shop/[category]`            | Category listing                                         |
| `/collections`                | Collections index                                        |
| `/collections/[slug]`         | Collection page                                          |
| `/products/[slug]`            | Product detail                                           |
| `/search?q=`                  | Search results                                           |
| `/about`                      | Our story                                                |
| `/journal`, `/journal/[slug]` | Editorial and care guides [V2]                           |
| `/contact`                    | Contact + FAQ                                            |
| `/bespoke`                    | Custom commissions enquiry                               |
| `/track-order`                | Guest order tracking                                     |
| `/policies/[slug]`            | Shipping, returns, cancellation, privacy, terms, cookies |
| `/wishlist`                   | Wishlist                                                 |

### 4.2 Global chrome

- Announcement bar (editable in admin, dismissible, remembered per session)
- Header: wordmark; Shop (mega-menu with categories and a featured collection image), Collections, About, Bespoke; search, wishlist, account and bag (live count with animation)
- Mobile menu: full-height drawer with a focus trap and close on Escape or route change
- Footer: shop links, support, policies, contact, social, newsletter, GSTIN/legal name, grievance officer link, © year
- Floating WhatsApp button: small and unobtrusive; hidden on checkout; pre-filled message that includes the product name on a PDP

### 4.3 Homepage

1. Hero: full-bleed editorial image (or a muted looping video under 2 MB), headline in StaggerText, mask-reveal image, a primary CTA "Explore the collection" and a secondary CTA "Our story"
2. Featured collections: an asymmetric 2–3 tile layout
3. **Curated pieces** (admin-selected featured products, not "bestsellers")
4. Brand philosophy: a short serif statement with plenty of whitespace
5. Material & craft: macro texture image + three short material notes (verified facts only)
6. Editorial lifestyle: an interior shot with hotspots linking to products
7. Gifting edit: products tagged as giftable + a gift-wrap mention
8. Bespoke teaser: "Commission a piece" → `/bespoke`
9. Newsletter
10. Instagram strip (only if the account exists, using hand-picked images)
11. Footer

All sections are driven by `store_settings` and editable in the admin.

### 4.4 Listing pages (shop, category, collection)

- Server-rendered product grid: 2 columns on mobile, 3 on tablet, 3–4 on desktop
- Product card: 4:5 image, second image on hover, name, price, small status label (`One of a kind` / `Made to order · 3 weeks` / `Sold`), wishlist heart. Nothing else.
- Filters: category, collection, material, finish, colour, price range, availability, uniqueness type. Desktop: sidebar or drawer. Mobile: bottom sheet.
- Sort: featured, newest, price ascending/descending
- State stored in the URL (`?material=marble&sort=price_asc&page=2`)
- "Load more" with proper `?page=` links for SEO
- Skeleton, empty and error/retry states
- Collection page: banner, editorial intro, breadcrumbs, SEO metadata

### 4.5 Product detail page (highest priority)

- **Gallery:** vertical thumbnails on desktop, swipe + dots on mobile; click opens a full-screen lightbox with pinch/zoom; images grouped by kind (hero → angles → detail → scale → lifestyle)
- **Buy box:** title, price (with compare-at price if set), status, "Inclusive of all taxes", variant selector (updates price, SKU, images and stock), quantity (hidden for one-of-a-kind items), **Add to bag**, **Buy now**, wishlist, share
- **Payment reassurance:** "No-cost EMI available from ₹X/month" (shown only when Razorpay EMI is enabled), UPI, cards
- **Pincode checker:** "Check delivery" → serviceability + estimated delivery date (Shiprocket) + COD availability
- **One-of-a-kind notice:** "This is the exact piece you will receive" plus a natural-variation note
- **Made-to-order notice:** lead time and expected ship date
- **Sold out:** "Notify me when available" (email capture)
- **Accordions:** Description · Dimensions & weight (with a simple line diagram) · Material & finish · Care · Shipping & packaging · Returns & breakage
- **Concierge row:** "Request more photos" · "Book a video viewing" · "Ask on WhatsApp"
- Complete the setting (complementary products set in the admin), related products, recently viewed (stored on the device)
- Mobile: a sticky add-to-bag bar that appears once the main button scrolls out of view
- Structured data: `Product` + `Offer` (real price and availability) + `BreadcrumbList`

### 4.6 Search

- Search overlay (⌘K / the search icon), with instant suggestions (debounced, top 6 results with thumbnails) and quick links to collections
- `/search` results page with filters and sort, a result count, and a no-results state with suggestions
- Postgres `tsvector` over name, description, material, category and collection, plus trigram matching for typos
- Search queries logged anonymously for the admin

### Acceptance

- Every link resolves. Filters change the results. Variant switching updates everything. Lighthouse mobile performance ≥ 90 on home, listing and PDP with seed data.

---

## Phase 5 — Bag, wishlist and pre-checkout [MVP]

- **Bag drawer** (slides from the right) plus a `/bag` page for no-JS and deep links
- Cart stored server-side, identified by an httpOnly cookie token; merged into the user's cart on login
- Add, remove, change quantity; optimistic UI reconciled with the server response; changes announced through an `aria-live` region
- Server re-validates on every read: price changes, unpublished products and stock shortfalls are flagged inline ("Price updated", "Only 1 left — quantity adjusted")
- One-of-a-kind items: quantity fixed at 1
- Coupon field with server validation and a specific error message per failure
- Gift options: wrap (price from settings), message (max 200 characters), hide prices on the invoice
- Shipping estimate once a pincode is known
- Free-shipping progress line, only if the owner sets a threshold
- Complementary suggestions below the totals (never blocking the checkout button)
- **Wishlist:** works for guests (cookie) and logged-in users (database); merged on login; shareable link [V2]
- **Abandoned-cart email** [V2]: for logged-in or email-captured carts with consent, sent once after 4 h, using Vercel Cron

### Acceptance

- Unit tests for cart totals across coupon, gift-wrap, shipping and tax combinations. End-to-end test: add → change quantity → remove → apply coupon.

---

## Phase 6 — Checkout and payments [MVP]

### 6.1 Checkout UX (`/checkout`, minimal header, no footer distractions)

Single page with progressive sections on mobile:

1. **Contact:** email + phone (guest checkout by default; "Sign in for faster checkout" link)
2. **Delivery address:** Indian address form with pincode auto-filling city/state; saved addresses for logged-in users; serviceability re-checked
3. **Delivery method:** standard / express (rates from the shipping rules or Shiprocket), with the delivery estimate
4. **Billing address:** "same as delivery" toggle; optional GSTIN field for business invoices
5. **Review:** order summary with items, gift options, coupon, subtotal, shipping, GST breakdown, total
6. **Pay:** opens Razorpay Checkout (UPI, cards, netbanking, wallets, EMI)

### 6.2 Server flow (authoritative)

```
1. POST /checkout/start
   - Validate cart, address and coupon on the server (Zod)
   - Recompute every price, discount, shipping and tax from the DB (ignore client values)
   - BEGIN TRANSACTION
       SELECT inventory ... FOR UPDATE
       Insert stock_reservations (expires in 15 min); inventory.reserved += qty
       Create order (status = pending_payment, public_ref, item snapshots)
     COMMIT
   - Create a Razorpay Order (amount in paise, receipt = public_ref); save provider_order_id
   - Return the razorpay order_id + key_id to the client

2. Client opens Razorpay Checkout
   - On handler success → POST /checkout/verify with payment_id, order_id, signature
   - Server verifies the HMAC signature → marks payment "authorised/verified"
   - UI shows "Confirming your payment..." then the confirmation page

3. Webhook /api/webhooks/razorpay   (source of truth)
   - Verify the X-Razorpay-Signature with the webhook secret
   - Insert into webhook_events (unique event_id) → if it already exists, return 200 and stop (idempotent)
   - payment.captured / order.paid:
       TRANSACTION: order → paid; reservation → consumed;
       inventory.on_hand -= qty, reserved -= qty; inventory_adjustment(sale);
       coupon_redemption insert; invoice_no assigned (sequential per financial year)
       queue order-confirmation email (only once)
   - payment.failed: order → payment_failed; release the reservation
   - refund.processed: update the refund + order status

4. Cron every 5 min: expire reservations past expires_at → release stock; order → expired
```

### 6.3 Edge cases to handle explicitly

- Payment captured after the reservation expired → if stock is still available, take it; otherwise flag the order for an automatic refund + an admin alert
- Two shoppers buying the same one-of-a-kind item → row lock; the second shopper sees "This piece has just been reserved"
- The user closes the Razorpay modal → order stays `pending_payment`; a "Retry payment" button reuses the same order
- Double-clicking Pay → idempotency key per checkout attempt
- Price changed between bag and checkout → shown at the review step and must be acknowledged
- Webhook arrives before `/verify` (or `/verify` never arrives) → the webhook alone completes the order
- Coupon limit reached concurrently → checked again inside the transaction

### 6.4 Payment options

- UPI, cards, netbanking, wallets (whatever Razorpay enables for the merchant)
- **No-cost EMI** [MVP if Razorpay approves it] — the subvention cost is the owner's business decision
- **COD** — off by default; a settings toggle with a maximum order value and an optional COD fee; COD orders go to `confirmed_cod` without a payment record
- **Payment Links** (admin-created, for WhatsApp/bespoke orders) [MVP]
- **Advance payment for made-to-order items** (for example 50% now) [V2]

### 6.5 Confirmation page (`/order/[public_ref]?t=token`)

Order number, items, delivery estimate, "What happens next" timeline, a link to create an account, and a "continue browsing" option. It is accessible only with a signed token or as the owning user.

### Acceptance (tested against Razorpay test mode)

- Success, failure, closing the modal, retrying, a duplicate webhook (replayed 3 times → one order and one email), an expired reservation, two concurrent buyers of a unique item, a tampered client price.

---

## Phase 7 — Orders, shipping, invoices and email [MVP]

### 7.1 Order state machine

```
pending_payment → paid → processing → packed → shipped → out_for_delivery → delivered
        │             │        │
        ├→ payment_failed      ├→ cancel_requested → cancelled → refund_pending → refunded
        └→ expired             └→ (COD) confirmed_cod → processing ...
delivered → return_requested → return_approved → returned → refunded
```

Allowed transitions are enforced in one `transitionOrder()` domain function. Every transition writes to `order_events` and `audit_logs`.

### 7.2 Shipping

- Shipping rules engine: flat / weight-slab / free above a threshold, with per-product surcharges for heavy pieces; configurable in the admin
- Shiprocket integration: serviceability + rates (PDP pincode check, checkout), create the shipment + AWB from the admin, label PDF, tracking webhook → updates the shipment and order status
- Fallback: manual carrier + AWB + tracking URL entry
- Insurance flag per order (for high values)

### 7.3 GST invoice

- A PDF generated server-side once the order is paid. It includes:
  - Seller legal name, address and GSTIN
  - Buyer name, address and GSTIN (if given)
  - Invoice number (sequential per financial year, e.g. `SC/25-26/0001`), date and place of supply
  - Per line: HSN, quantity, taxable value, CGST/SGST or IGST rates and amounts
  - Total in figures and words
- Downloadable by the customer and the admin. "Hide prices" applies only to the packing slip, never the tax invoice.
- ⚠ The format must be reviewed by her CA before launch.

### 7.4 Transactional emails (React Email, brand-styled, plain-text versions)

| Trigger                      | Email                                                              |
| ---------------------------- | ------------------------------------------------------------------ |
| Sign-in OTP                  | Login code                                                         |
| Order paid / COD confirmed   | Order confirmation + invoice link                                  |
| Status → shipped             | Shipped (AWB + tracking link)                                      |
| Out for delivery / delivered | Delivery updates                                                   |
| Cancelled                    | Cancellation confirmation                                          |
| Refund processed             | Refund confirmation (amount, expected timeline)                    |
| Back in stock                | Notify-me email                                                    |
| Enquiry received             | Auto-acknowledgement to the customer + a notification to the owner |
| New order                    | Owner notification (email; WhatsApp alert [V2])                    |
| Low stock                    | Daily digest to the owner                                          |

Each email is sent from an event with a deduplication key (`order_id + email_type`), so webhook retries never send twice.

### 7.5 Order tracking

- `/track-order`: order reference + email or phone → status timeline + tracking link. Rate-limited. Order references are random, never sequential.
- Logged-in customers see the same view in their account.

---

## Phase 8 — Admin dashboard [MVP core, V2 extras]

Located at `/admin`, behind admin role + TOTP. Its own clean layout (functional, still on-brand). Every action is validated on the server and written to the audit log.

### 8.1 Overview [MVP]

Today, 7-day and 30-day revenue (paid orders only, test orders excluded); orders to fulfil; low-stock list; recent orders; open enquiries; failed payments to follow up.

### 8.2 Products [MVP]

- List with search, status filter, category filter
- Editor: all fields, rich-text description, variants table, inventory per variant, uniqueness type, lead time, HSN/GST, shipping dimensions, SEO, collections, complementary products
- Image manager: drag-drop upload (signed Cloudinary upload), reorder, set the image kind, alt text required, assign to a variant
- Draft → preview link → publish; archive instead of hard delete when orders reference the product
- Slug change automatically creates a redirect
- **CSV import/export** (matches the Phase 0 template), with a dry-run validation report

### 8.3 Inventory [MVP]

Stock table, quick adjust with a reason, adjustment history, low-stock threshold per variant.

### 8.4 Categories and collections [MVP]

Create/edit/reorder, banner and intro, drag to order the products within a collection.

### 8.5 Orders [MVP]

- Filter by status/date/payment; search by reference, email or phone
- Detail: items, customer, addresses, payments, timeline, notes, invoice
- Actions: move status forward, create a Shiprocket shipment / add tracking manually, print the packing slip, cancel, **refund through the Razorpay API** (full or partial; marked complete only when Razorpay confirms), resend an email
- Create a Payment Link for a custom order [MVP]
- Test orders visibly tagged and excluded from metrics

### 8.6 Customers [MVP basic]

Search, profile, order history, lifetime value, marketing consent; data export/delete request handling (DPDP).

### 8.7 Coupons [MVP]

Create percentage or fixed coupons with minimum order, maximum discount, validity dates, total and per-customer limits, and scope; view redemptions; deactivate.

### 8.8 Enquiries and support [MVP]

Inbox for bespoke, more-photos, video-call and contact messages; status (new / replied / closed); reply via email link.

### 8.9 Content [MVP]

Announcement bar, homepage sections (hero image/text/CTA, featured collections, curated products, editorial blocks), footer, contact details, social links, policy and About pages (rich text), shipping rules, COD rules, gift wrap price, seller tax details.

### 8.10 [V2]

Staff roles with permissions, returns management, sales reports + CSV export, newsletter campaigns, search-term insights, abandoned-cart dashboard.

---

## Phase 9 — Customer account [MVP basic]

- `/account` sign-in with an email OTP (6-digit code or magic link)
- Overview, orders list, order detail (timeline, tracking, invoice download), addresses, profile, wishlist, communication preferences
- Cancellation request: allowed only before `packed`; it creates a request the admin approves
- Return request [V2]: within the policy window; requires photos/unboxing video for breakage claims
- Delete-my-account / export-my-data requests (DPDP)
- Isolation test: user A can never read user B's orders through the UI, an API or a changed URL

---

## Phase 10 — Content, policies, compliance and SEO [MVP]

### 10.1 Pages

- About / Our Story (editorial layout, verified content only)
- Bespoke (process steps + enquiry form with reference image upload)
- Contact + FAQ (accordion; FAQPage structured data)
- Care guide (as a page at launch; a Journal in V2)

### 10.2 Policies (drafts marked **"Pending owner approval"** until signed off) ⚠ Client

Shipping · Returns & refunds (including the breakage claim process) · Cancellation · Privacy (DPDP-aligned) · Terms · Cookie policy

### 10.3 Indian e-commerce compliance

- Consumer Protection (E-Commerce) Rules 2020: legal entity name, address, contact, **grievance officer** name and contact in the footer/contact page; country of origin on each PDP; total price inclusive of taxes; clear return/refund/exchange terms
- DPDP Act 2023: clear consent for marketing, a privacy notice, data access and deletion requests, minimal data collection
- Cookie/analytics consent banner (minimal, on-brand)
- GST invoices (Phase 7.3)

### 10.4 SEO

- `generateMetadata` on every route: unique titles and descriptions, canonical URLs, Open Graph/Twitter images (dynamic OG images for products)
- Structured data: `Organization` (verified details), `WebSite` + SearchAction, `Product`/`Offer`, `BreadcrumbList`, `FAQPage`
- `sitemap.xml` (products, collections, categories, pages; regenerated on publish), `robots.txt` (blocks /admin, /account, /checkout, /bag)
- 301 redirects from `slug_redirects`
- Faceted listing URLs: canonical to the base listing, `noindex` on deep filter combinations
- Image alt text required in the admin
- Google Search Console + Merchant Center feed [V2]

---

## Phase 11 — Motion and interaction polish [MVP]

Applied after the pages work, never before:

- Homepage: hero staggered text + mask reveal (≤ 1.2 s total, content usable immediately)
- Section reveals on scroll (IntersectionObserver-based, once only, small 16–24 px movement)
- Product cards: image scale 1.03 + second image cross-fade; underline on hover
- PDP: gallery cross-fade, thumbnail indicator slide, lightbox zoom, accordion height animation
- Bag: drawer slide + overlay fade, bag count spring, line-item add/remove layout animation
- Page transitions: subtle fade only (no blocking transitions)
- Every animation tested with `prefers-reduced-motion: reduce`

---

## Phase 12 — Analytics, performance and accessibility [MVP]

### 12.1 Analytics (after consent)

Events: `view_item_list`, `view_item`, `search`, `add_to_wishlist`, `add_to_cart`, `remove_from_cart`, `begin_checkout`, `add_shipping_info`, `add_payment_info`, `purchase` (sent server-side from the webhook and deduplicated by order id), `enquiry_submit`, `newsletter_signup`. No personal data in the payloads.

### 12.2 Performance budget

- LCP < 2.5 s and CLS < 0.1 on 4G mobile; INP < 200 ms
- JavaScript per route < 150 KB gzipped on storefront pages
- Hero image preloaded; all other images lazy-loaded with explicit sizes; AVIF/WebP from Cloudinary
- Static/ISR for catalogue pages with on-demand revalidation when the admin publishes; **no caching** on bag/checkout prices or stock
- Database queries checked with `EXPLAIN` for listing and search

### 12.3 Accessibility (WCAG 2.2 AA)

Semantic landmarks, heading order, a skip link, full keyboard paths (menu, filters, gallery, drawer, checkout), focus traps in dialogs, visible focus rings, labelled controls, error messages linked to fields, `aria-live` for bag/toast updates, contrast checked, touch targets ≥ 44 px. Tested with axe + keyboard + NVDA/VoiceOver smoke tests.

---

## Phase 13 — Quality assurance [MVP]

### 13.1 Automated tests

- **Unit:** money, tax extraction/split, coupon rules, shipping rules, order state transitions, slug generation
- **Integration (test database):** reservation concurrency (parallel checkouts on a unique item), webhook idempotency (replayed events), signature verification (valid/invalid), refund flow, role guards on every admin action
- **End-to-end (Playwright, Razorpay test mode):**
  1. Browse → filter → PDP → variant → add to bag → checkout as a guest → pay successfully → confirmation → email logged
  2. Payment failure → retry → success
  3. Sign in with OTP → order history → invoice download
  4. Admin: create product → upload images → publish → appears in the shop → order → mark shipped → customer sees tracking
  5. Coupon: valid, expired, minimum not met, usage limit
  6. Mobile viewport versions of flows 1 and 3

### 13.2 Manual QA checklist

- Devices: iPhone SE size, current iPhone, a mid-range Android, iPad, a 13" laptop, a 27" monitor
- Browsers: Chrome, Safari (iOS and macOS), Firefox, Samsung Internet
- Broken-link crawl, image check, 404/500 pages, slow-network behaviour, JavaScript-disabled browsing
- Security: admin URL access as a customer/anonymous user, IDOR on orders, rate-limit checks, headers scan, a dependency audit (`pnpm audit`)

---

## Phase 14 — Launch [MVP]

### 14.1 Pre-launch (staging, about 1 week before)

- [ ] Real products and photos loaded through CSV import; samples removed
- [ ] Policies approved by the owner; invoice format approved by the CA ⚠ Client
- [ ] Razorpay **live** keys + live webhook configured; one real ₹1 test product purchased and refunded
- [ ] Shiprocket live; one real test shipment booked and cancelled
- [ ] Resend domain verified; SPF/DKIM/DMARC passing (checked with mail-tester)
- [ ] Production database backups/PITR enabled; restore tested once
- [ ] Sentry alerts → owner and developer email
- [ ] Analytics + consent verified; Search Console verified; sitemap submitted
- [ ] Admin TOTP enabled; admin credentials handed over securely
- [ ] Uptime monitor on home, PDP and the webhook endpoint

### 14.2 Go-live

- Point studioclayrity.com (apex + www redirect) to Vercel; SSL verified
- Smoke test of all critical flows in production
- Watch logs, payments and emails closely for the first 48 hours

### 14.3 Handover

- `README.md`: setup, scripts, environment variables, deploy process
- `docs/OPERATIONS.md`: how to add a product, fulfil an order, refund, create a coupon, edit the homepage, handle a breakage claim
- `docs/INTEGRATIONS.md`: Razorpay, Shiprocket, Resend and Cloudinary setup + where the keys live
- A short screen-recorded admin walkthrough for the owner
- A list of remaining configuration items and known limitations

---

## Phase 15 — Post-launch roadmap [V2]

| Priority | Item                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| High     | Return/exchange workflow with photo/video upload; abandoned-cart emails; owner WhatsApp alerts for new orders |
| High     | Journal (care guides, styling stories) for SEO                                                                |
| Medium   | Phone OTP login (MSG91); WhatsApp Business API order updates                                                  |
| Medium   | Trade programme for interior designers/architects (applications, trade pricing tier)                          |
| Medium   | Advance/partial payment for made-to-order items                                                               |
| Medium   | Verified-purchase reviews (only after real orders exist)                                                      |
| Medium   | Newsletter campaigns (Resend Audiences or Klaviyo)                                                            |
| Low      | Google Merchant Center feed, Meta catalogue                                                                   |
| Low      | Multi-currency + international shipping                                                                       |
| Low      | Room/scale visualiser or AR preview                                                                           |
| Low      | Staff accounts with granular permissions; sales reports export                                                |

---

## Rough timeline (one developer working with Claude; adjust after Phase 0)

| Phase                               | Estimate                      |
| ----------------------------------- | ----------------------------- |
| 0 Discovery & accounts              | Week 1 (KYC runs in parallel) |
| 1 Foundation                        | 2–3 days                      |
| 2 Design system                     | Week 2                        |
| 3 Data & backend                    | Week 3                        |
| 4 Storefront                        | Weeks 4–5                     |
| 5 Bag & wishlist                    | Week 5                        |
| 6 Checkout & payments               | Week 6                        |
| 7 Orders, shipping, email, invoices | Week 7                        |
| 8 Admin                             | Weeks 7–8                     |
| 9 Account                           | Week 8                        |
| 10 Content, compliance, SEO         | Week 9                        |
| 11–12 Motion, performance, a11y     | Week 9                        |
| 13 QA                               | Week 10                       |
| 14 Launch                           | Week 10–11                    |

**MVP is roughly 10–11 weeks.** The usual critical path is the client's photography, policies, and Razorpay/Shiprocket KYC, not the code.

---

## Definition of done (MVP)

- A real customer can find a product, buy it with UPI/card/EMI, receive a GST invoice and emails, and track delivery.
- The owner can add products, manage stock, fulfil, ship, refund, create coupons and edit homepage content, all without touching code.
- Payments are verified by the server and webhooks; duplicate events cause no double orders or double emails; a unique piece can never be sold twice.
- Mobile-first, WCAG AA, Lighthouse ≥ 90, reduced-motion respected.
- No secrets in the repo; backups enabled; errors monitored.
- Every remaining external dependency is documented honestly.
