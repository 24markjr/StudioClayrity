# Checkout and Payments

## How an order flows

```
Bag ──▶ /checkout ──▶ submitCheckout (server)
                       │  re-price everything from the database (quote.ts)
                       │  one transaction: create order + line snapshots, hold stock (15 min)
                       ▼
             ┌─ Cash on delivery: confirmed immediately, stock taken, invoice number issued
             └─ Online: create Razorpay order ──▶ Razorpay Checkout modal (UPI, cards, net banking, wallets)
                                                   │
                         ┌─────────────────────────┴──────────────────────────┐
              browser handler                                        Razorpay webhook
     confirmPayment: verify signature,                    POST /api/webhooks/razorpay
     then ask Razorpay for the status                     signature-checked, deduplicated
                         └──────────── markPaid (idempotent, row-locked) ─────┘
                                       stock taken · invoice number · coupon recorded
                                       bag emptied · confirmation email (once)
```

- **The browser is never trusted.** Prices, discounts, shipping, gift wrap, COD fee and GST are computed on the server. The browser's "payment succeeded" only triggers a check: the signature is verified _and_ Razorpay is asked for the payment's real status.
- **The webhook is the source of truth.** It is verified against the raw body with `RAZORPAY_WEBHOOK_SECRET`, stored once per event id, and safe to receive any number of times.
- **No double orders, no double charges for stock.** A per-page idempotency key stops double submits; row locks make concurrent webhook + browser confirmations do the work exactly once; a one-of-a-kind piece can't be sold twice.
- **Totals changed?** If the price the shopper saw differs from the server's, nothing is created and the new total is shown for review.

## Order states

`pending_payment` → `paid` (or `confirmed_cod`) → processing → packed → shipped → delivered.

| Situation                                                | What happens                                                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Payment fails                                            | `payment_failed`, stock released. Customer can "Try payment again" from the order page (stock re-held if still available).  |
| Customer closes the payment window                       | Order stays `pending_payment` with stock held; the button becomes "Try payment again".                                      |
| Nobody pays within 15 minutes                            | The expiry job marks it `expired` and releases stock.                                                                       |
| Payment arrives after expiry, stock still there          | Order is paid normally.                                                                                                     |
| Payment arrives after expiry, piece sold to someone else | `refund_pending` with an internal note — refund from the admin (Phase 8). The customer sees an apology and a refund notice. |
| Captured amount ≠ order total                            | `refund_pending`, flagged for investigation, never fulfilled automatically.                                                 |
| Razorpay can't create the payment                        | Order cancelled, stock released, shopper told to try again.                                                                 |

## Checkout opens only when the store is ready

`/checkout` shows a plain explanation instead of the form until **all** of these are true:

1. Shipping rates are confirmed (`shipping.ratesConfirmed`).
2. In production, the seller's tax details are confirmed (`seller.isConfirmed`, with the GSTIN and state).
3. At least one payment method exists: Razorpay keys, and/or cash on delivery enabled.

Until the admin screens exist (Phase 8), set these from the command line — amounts are in **paise** (₹500 = 50000):

```bash
pnpm settings:set shipping '{"ratesConfirmed":true,"flatRate":50000,"freeAbove":1500000,"expressRate":null,"chargesGstRateBp":1800}'
pnpm settings:set seller '{"legalName":"<legal name>","gstin":"<GSTIN>","stateCode":"29","address":"<registered address>","isConfirmed":true}'
pnpm settings:set cod '{"enabled":false,"maxOrderTotal":0,"fee":0}'
pnpm settings:get shipping
```

⚠ GST on shipping/gift wrap/COD fee (`chargesGstRateBp`) and each product's rate and HSN must be confirmed by the owner's CA.

## Razorpay setup

1. **Keys:** Razorpay Dashboard → Account & Settings → API Keys. Use **test** keys (`rzp_test_…`) for staging/preview, live keys only in production.
   `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
2. **Auto-capture:** Account & Settings → Payment capture → **Automatic**. (Authorised-but-uncaptured payments are never treated as paid.)
3. **Webhook:** Account & Settings → Webhooks → Add:
   - URL: `https://studioclayrity.com/api/webhooks/razorpay` (and the staging URL for test mode)
   - Events: `payment.captured`, `payment.failed`, `order.paid`
   - Secret: a long random string → `RAZORPAY_WEBHOOK_SECRET`
4. **Test a payment end to end** in test mode with Razorpay's test cards/UPI IDs, then check: order page says confirmed, stock dropped, invoice number set, confirmation email logged/sent.
5. **EMI / payment methods** are whatever Razorpay enables on the account — no code change needed.

Without keys, online payment is simply not offered, and the webhook endpoint answers `503 not_configured`. Nothing ever pretends a payment succeeded.

## The expiry job

`GET /api/cron/expire-orders` with `Authorization: Bearer $CRON_SECRET`, scheduled every 5 minutes in `vercel.json`.
⚠ Vercel's Hobby plan only runs cron jobs once a day. On Hobby, use an external scheduler (e.g. cron-job.org or a scheduled GitHub Action) to call the URL every 5 minutes with the header, or upgrade to Pro. Even without it, a late payment is still handled correctly — expiry only frees held stock sooner.

## Emails

The order confirmation is sent once per order (deduplicated in `email_deliveries`) after payment or a COD order. Without Resend keys it's logged locally with the address masked. Branded templates, shipping and refund emails come in Phase 7.

## Tests

- `tests/integration/checkout.test.ts` — the whole lifecycle against a real database, with the real Razorpay client and only Razorpay's servers stood in: pricing and GST split, idempotency, concurrent buyers of a one-of-a-kind piece, signed webhooks (bad signatures rejected, five duplicate deliveries processed once), browser confirmation only after a captured status, failure → retry, expiry, late payments, COD, per-customer coupon limits.
- `tests/e2e/checkout.spec.ts` — the real page: summary, GST by state, validation, a complete cash-on-delivery order.
