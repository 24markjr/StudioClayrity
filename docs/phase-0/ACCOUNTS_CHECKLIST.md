# Accounts and Access Checklist

**Rule:** credentials live in a password manager (Bitwarden / 1Password) shared between the owner and the developer. They are **never** committed to this repository, pasted into chat, or emailed in plain text. Account ownership stays with the business (owner's email); the developer is invited as a team member.

| #   | Service                                              | Purpose                                   | Owner action                                                                          | Developer action                                          | Status |
| --- | ---------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------ |
| 1   | Domain registrar (studioclayrity.com)                | DNS                                       | Share access or delegate DNS to Cloudflare                                            | Configure records                                         | ☐      |
| 2   | Cloudflare (free)                                    | DNS, Turnstile spam protection            | Create account, add domain                                                            | Add records, create Turnstile site key                    | ☐      |
| 3   | Google Workspace or Zoho Mail                        | `hello@`, `orders@`, `support@` mailboxes | Sign up, pay                                                                          | MX/SPF/DKIM/DMARC records                                 | ☐      |
| 4   | **Razorpay**                                         | Payments, EMI, payment links              | Sign up + complete KYC (PAN, bank, GST, website URL) — **start now, takes 3–10 days** | Request EMI + Payment Links activation; configure webhook | ☐      |
| 5   | **Shiprocket**                                       | Shipping rates, labels, tracking          | Sign up + KYC + pickup address                                                        | API user, webhook                                         | ☐      |
| 6   | GitHub — `24markjr/StudioClayrity`                   | Source code                               | —                                                                                     | Done                                                      | ☑      |
| 7   | Vercel                                               | Hosting, previews, cron                   | Create team (owner email)                                                             | Connect repo, environments                                | ☐      |
| 8   | Supabase (region: Mumbai `ap-south-1`)               | Database, auth                            | Create org (owner email), invite developer                                            | Create `staging` + `production` projects                  | ☐      |
| 9   | Cloudinary                                           | Product images                            | Create account                                                                        | Upload presets, signed uploads                            | ☐      |
| 10  | Resend                                               | Transactional email                       | Create account                                                                        | Verify domain, API key                                    | ☐      |
| 11  | Upstash                                              | Rate limiting (Redis)                     | —                                                                                     | Create database                                           | ☐      |
| 12  | Sentry                                               | Error monitoring                          | —                                                                                     | Create project, DSN                                       | ☐      |
| 13  | Google Search Console + Analytics (GA4 or Plausible) | SEO + analytics                           | Google account                                                                        | Verify domain, create property                            | ☐      |

## Environment variables these produce

All names are listed in `.env.example` at the repository root. Each environment (local, preview/staging, production) gets its own values; Razorpay **test** keys everywhere except production.
