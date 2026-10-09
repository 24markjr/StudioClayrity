# Studio Clayrity

E-commerce site for Studio Clayrity — premium decor objects. Domain: [studioclayrity.com](https://studioclayrity.com).

The full roadmap is in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Client onboarding material (questionnaire, accounts checklist, product template, photography brief) is in [docs/phase-0](docs/phase-0).

## Status

| Phase                                  | State                                                                |
| -------------------------------------- | -------------------------------------------------------------------- |
| 0 — Discovery & onboarding kit         | Documents ready; waiting on client answers and account sign-ups      |
| 1 — Project foundation                 | Done                                                                 |
| 2 — Design system                      | Done — review at `/styleguide` and `/styleguide/hero`                |
| 3 — Data model & backend               | Done — see [docs/DATABASE.md](docs/DATABASE.md)                      |
| 4 — Storefront                         | Done (catalogue mode) — see [docs/STOREFRONT.md](docs/STOREFRONT.md) |
| 5 — Bag & wishlist                     | Done — see [docs/STOREFRONT.md](docs/STOREFRONT.md)                  |
| 6 — Checkout & payments                | Done — see [docs/CHECKOUT.md](docs/CHECKOUT.md)                      |
| 7 — Orders, shipping, invoices & email | Done — see [docs/SHIPPING.md](docs/SHIPPING.md)                      |
| 8 — Admin dashboard                    | Next                                                                 |

## Stack

Next.js (App Router) · React · TypeScript (strict) · Tailwind CSS · Motion · Zod · Vitest · Playwright. Design system notes: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md). PostgreSQL + Drizzle ORM, Supabase Auth, and service adapters for Razorpay, Resend, Cloudinary and Shiprocket — see [docs/DATABASE.md](docs/DATABASE.md).

## Requirements

- Node 24 (see `.nvmrc`)
- pnpm (version pinned in `package.json` → `packageManager`; run `corepack enable` once)

## Getting started

```bash
pnpm install
docker compose up -d          # local Postgres (or point DATABASE_URL at any Postgres)
cp .env.example .env.local    # set DATABASE_URL and TEST_DATABASE_URL
pnpm db:migrate && pnpm db:seed
pnpm dev                      # http://localhost:3000
```

## Scripts

| Command                             | What it does                                                              |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`                          | Development server                                                        |
| `pnpm build`                        | Production build (also validates environment variables)                   |
| `pnpm start`                        | Serve the production build                                                |
| `pnpm lint`                         | ESLint                                                                    |
| `pnpm typecheck`                    | TypeScript, no emit                                                       |
| `pnpm test`                         | Unit tests (Vitest)                                                       |
| `pnpm test:e2e`                     | End-to-end tests (Playwright; run `pnpm build` first — uses local Chrome) |
| `pnpm format` / `pnpm format:check` | Prettier                                                                  |

A pre-commit hook (Husky + lint-staged) formats and lints staged files. CI (`.github/workflows/ci.yml`) runs format check, lint, typecheck, tests and build on every push and pull request.

## Environment variables

Documented in [.env.example](.env.example) and validated by [src/lib/env.ts](src/lib/env.ts). `.env*` files are git-ignored except the example. Never commit secrets.

## Folder structure

```
src/
  app/                 routes (storefront, account, checkout, admin, api)
  components/ui        design-system primitives
  components/store     storefront components
  components/admin     admin components
  lib/db               database schema and client
  lib/services         payment, email, shipping, storage, analytics adapters
  lib/domain           business logic (pricing, tax, inventory, orders, coupons)
  lib/validation       shared Zod schemas
  lib/auth             session and role guards
  emails/              email templates
tests/                 unit, integration, e2e
docs/                  project documentation
```

## Deployment

Hosted on Vercel, connected to this GitHub repository. `main` deploys to production; pull requests get preview URLs. Set `APP_ENV=staging` for Preview and `APP_ENV=production` for Production in the Vercel project settings.
