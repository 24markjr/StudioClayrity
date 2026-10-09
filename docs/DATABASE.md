# Database and Backend

## Stack

- **PostgreSQL** (Supabase in staging/production, Mumbai `ap-south-1`; Docker locally)
- **Drizzle ORM** — schema in [`src/lib/db/schema/`](../src/lib/db/schema), SQL migrations in [`drizzle/`](../drizzle)
- **Supabase Auth** for sign-in only; all data access is server-side through Drizzle

## Local setup

```bash
docker compose up -d          # Postgres 17 on localhost:5433 (dev + test databases)
cp .env.example .env.local    # then set:
#   DATABASE_URL=postgres://postgres:postgres@localhost:5433/studioclayrity
#   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/studioclayrity_test
pnpm db:migrate               # create tables
pnpm db:seed                  # 12 sample products, 3 collections, 4 categories
```

| Command                                             | What it does                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm db:generate`                                  | Create a migration after editing the schema (commit the generated SQL)                |
| `pnpm db:migrate`                                   | Apply pending migrations                                                              |
| `pnpm db:seed` / `pnpm db:seed --remove`            | Add or remove sample data (refused in production or if real orders exist)             |
| `pnpm db:studio`                                    | Browse the database                                                                   |
| `pnpm admin:grant <email> [admin\|staff\|customer]` | Change someone's role (they must have signed in once)                                 |
| `pnpm test:integration`                             | Integration tests — **wipes** `TEST_DATABASE_URL` and rebuilds it from the migrations |

CI fails if the schema was changed without generating a migration.

## Data model (38 tables)

| Area            | Tables                                                                                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| People          | `profiles` (id = Supabase user id, role), `addresses`                                                                                                                                   |
| Catalogue       | `categories`, `collections`, `collection_products`, `products`, `product_variants`, `product_images`, `product_relations`, `slug_redirects`                                             |
| Stock           | `inventory` (on hand / reserved), `inventory_adjustments` (history), `stock_reservations` (holds for unpaid orders)                                                                     |
| Shopping        | `carts`, `cart_items`, `wishlists`, `wishlist_items`                                                                                                                                    |
| Orders          | `orders`, `order_items` (snapshot), `order_events` (status history), `payments`, `refunds`, `webhook_events`, `shipments`, `coupon_redemptions`, `return_requests`, `invoice_sequences` |
| Promotions      | `coupons`, `coupon_products`, `coupon_collections`                                                                                                                                      |
| Content & comms | `store_settings`, `pages`, `enquiries`, `back_in_stock_requests`, `newsletter_subscribers`, `email_deliveries`, `search_queries`, `audit_logs`                                          |

## Rules the database enforces

- **Money is integer paise.** GST rates are basis points (`1800` = 18%). Prices are GST-inclusive.
- Stock can't go negative and reservations can't exceed stock on hand (CHECK constraints).
- `orders.total = subtotal − discount + shipping + gift wrap + COD fee`, and `tax_total = cgst + sgst + igst`, with CGST/SGST and IGST mutually exclusive.
- `order_items` copy the name, SKU, price, HSN and GST rate at the time of purchase, so editing the catalogue never rewrites order history.
- Order references (`SC-7K3Q9X`) are random, not sequential. Guest order links and cart cookies store only a SHA-256 hash of the token.
- Webhooks are deduplicated by `(provider, event_id)`; emails by `dedupe_key`.
- Sequential GST invoice numbers per financial year (`SC/26-27/0001`), allocated atomically.
- Row Level Security is enabled on every table with no policies: the Supabase public API roles can't read anything, even with a leaked key. The app connects as the table owner from the server only. **New tables must enable RLS** — an integration test fails otherwise.

## Business logic (`src/lib/domain/`)

| Module            | Purpose                                                            |
| ----------------- | ------------------------------------------------------------------ |
| `tax.ts`          | Extract GST from inclusive prices; CGST/SGST vs IGST split         |
| `pricing.ts`      | Server-side order totals; proportional discount allocation         |
| `coupons.ts`      | Coupon validity and discount rules                                 |
| `inventory.ts`    | Stock adjustments, reservations (row-locked), consumption, release |
| `invoices.ts`     | Gap-free invoice numbering                                         |
| `order-status.ts` | Allowed order status transitions                                   |
| `settings.ts`     | Typed store settings with safe defaults                            |
| `identifiers.ts`  | Order refs, tokens, slugs, financial year                          |
| `india.ts`        | States with GST codes, PIN code / mobile / GSTIN validation        |

## Authentication and roles

- Customers: Supabase email OTP / magic link (Phase 9 builds the screens). Admins: email + password + TOTP.
- `src/proxy.ts` refreshes the session and sends signed-out visitors away from `/account` and `/admin`. It is a convenience only.
- The real checks live in `src/lib/auth/session.ts`: `requireUser()`, `requireRole("admin")` for pages, `authorizeRequest()` for API routes and server actions. Roles come from `profiles.role` in our database, never from the client.
- Customers can only read their own records (`canAccessOwnedRecord`); non-admins get a 404 on admin pages.

## Integrations (`src/lib/services/`)

| Service   | Provider                                                              | Without credentials                                                    |
| --------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Payments  | Razorpay (orders, refunds, checkout + webhook signature verification) | Every call throws — never a fake success                               |
| Email     | Resend, sent once per dedupe key                                      | Logs a masked one-liner locally; fails (and is recorded) in production |
| Images    | Cloudinary signed browser uploads                                     | Throws                                                                 |
| Shipping  | Manual (Shiprocket in Phase 7)                                        | Serviceability "unknown"; tracking entered by hand                     |
| Analytics | No-op (provider in Phase 12)                                          | —                                                                      |

## Supabase setup (when the account exists)

1. Create the project in **Mumbai (ap-south-1)**; enable Point-in-Time Recovery on the paid plan.
2. Set `DATABASE_URL` to the **Transaction pooler** string (port 6543), plus `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
3. `pnpm db:migrate` against staging; `pnpm db:seed` on staging only.
4. Auth → enable Email (OTP), set Site URL to the deployment URL, add redirect URLs.
5. Owner signs in once, then `pnpm admin:grant owner@…`.
