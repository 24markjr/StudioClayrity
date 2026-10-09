# Orders, shipping, invoices and email (Phase 7)

## Order lifecycle

```
paid / confirmed_cod → processing → packed → shipped → out_for_delivery → delivered
                  ↘ cancelled → refund_pending → refunded            ↘ returned (courier RTO)
```

All changes go through `src/lib/orders/lifecycle.ts`. Every change writes an `order_events` row, plus an `audit_logs` row when a staff member made it. Status rules live in `src/lib/domain/order-status.ts`. Anything not allowed there is refused.

| Action                | Function              | Notes                                                                                                                                                                                                                                                       |
| --------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Move to a status      | `transitionOrder`     | Intermediate steps (e.g. processing → packed) are filled in automatically when moving forward                                                                                                                                                               |
| Enter carrier + AWB   | `recordShipment`      | The order becomes `shipped`. The same AWB can't be used twice                                                                                                                                                                                               |
| Book with Shiprocket  | `bookShipment`        | Uses the packed weight and dimensions of each piece                                                                                                                                                                                                         |
| Courier status update | `applyTrackingUpdate` | Moves forward only, so updates arriving late or twice are ignored. RTO marks the order `returned` but does **not** put stock back: the owner inspects the piece first                                                                                       |
| Cancel                | `cancelOrder`         | Puts stock back and frees the coupon use. A captured online payment moves to `refund_pending`                                                                                                                                                               |
| Refund                | `refundOrder`         | Full or partial refund through Razorpay. The refund row is saved before Razorpay is called, so a retry never refunds twice. A full refund needs the order cancelled or returned first. Razorpay's `refund.processed` / `refund.failed` webhooks complete it |
| COD refund            | `recordManualRefund`  | Records a bank/UPI transfer the owner made                                                                                                                                                                                                                  |

The admin screens for these actions arrive in Phase 8. Until then they are only reachable from code and tests.

## Shiprocket

Without credentials the site uses the manual provider:

- PIN-code checks say "unknown";
- the owner enters the carrier and AWB by hand;
- tracking links exist for Delhivery, Blue Dart, DTDC and India Post.

With credentials:

- products show **Check delivery** (PIN code → serviceable, delivery-time range, COD);
- checkout refuses PIN codes no courier serves (if Shiprocket is down, the order is not blocked);
- shipments can be booked in one step: order → AWB → label → pickup.

### Setup

1. In Shiprocket → Settings → API → **Configure**, create an API user. It must use a different email from the main login. Set `SHIPROCKET_EMAIL` and `SHIPROCKET_PASSWORD`.
2. In Settings → Pickup addresses, add the studio's address. Set `SHIPROCKET_PICKUP_LOCATION` to its **nickname**, exactly as written, and `SHIPROCKET_PICKUP_PINCODE` to its PIN code.
3. In Settings → API → Webhooks, set the URL to `https://studioclayrity.com/api/webhooks/courier-tracking`. Shiprocket rejects URLs that contain the word "shiprocket". Set the token to a long random value, and put the same value in `SHIPROCKET_WEBHOOK_TOKEN`. Shiprocket sends it as the `x-api-key` header. Without the variable, the endpoint answers 503.

### ⚠ Verify before launch

The client follows Shiprocket's published API, and it is tested against a stand-in, not against Shiprocket itself. With the real account:

1. Check delivery to a few PIN codes, including one that should fail.
2. Book one real, low-value shipment and check:
   - the AWB, label and pickup appear in Shiprocket;
   - the AWB appears on `/track-order`.
3. Use the webhook test in Shiprocket's panel, then watch a real status update arrive. Unknown status texts are ignored on purpose. If a common one is missed, add it to `mapCourierStatus` in `src/lib/services/shipping.ts`.

## Guest order tracking

`/track-order` takes the order number plus the email or mobile number used at checkout (the phone can be typed in any common format).

- A wrong reference and a wrong contact get the same answer, so order numbers can't be probed.
- Attempts are limited to 10 per 10 minutes per IP.
- With `UPSTASH_REDIS_REST_URL`/`TOKEN` set, the limit is shared across server instances. Without them it is kept in memory per instance, which is weaker on a serverless host. Set Upstash before launch.

## GST invoice and packing slip

`src/lib/documents/` builds A4 PDFs with pdf-lib:

- **Tax invoice** contents:
  - seller GSTIN and address from the `seller` setting;
  - bill-to and ship-to;
  - place of supply;
  - each line with HSN, taxable value and CGST + SGST, or IGST for another state;
  - shipping, gift wrap and COD fee as their own lines, taxed at `shipping.chargesGstRateBp`;
  - totals and the amount in words (Indian system).
  - Column totals equal the stored order exactly.
- **Packing slip**: items and SKUs, with prices hidden for gift orders, plus the gift message.
- Customers download the invoice from their order page (`/api/orders/{ref}/invoice?t=…`, the same private token as the order link).
- The PDFs use the built-in Helvetica font, which has no ₹ sign, so amounts read "INR". Embedding a brand font is possible later.

Before launch, the accountant should check one sample invoice against the client's GST registration.

## Emails

Templates live in `src/emails/`. They share one layout, and every email has a plain-text version.

| Email                                  | Sent when                                          |
| -------------------------------------- | -------------------------------------------------- |
| Order confirmation                     | Payment captured or COD order placed               |
| Shipped / out for delivery / delivered | Shipment recorded or courier update                |
| Cancelled                              | Order cancelled (says whether a refund is coming)  |
| Refund processed                       | Razorpay confirms the refund                       |
| New order (owner)                      | Every confirmed order → `OWNER_NOTIFICATION_EMAIL` |
| Low stock digest (owner)               | Daily cron, only if something is low               |
| Back in stock                          | Ready for Phase 8's restock action                 |

- Each email is sent at most once. Duplicates are stopped by a key in `email_deliveries`.
- The emails make no promises about delivery or refund times. A test enforces this.

## Scheduled jobs

`vercel.json` runs:

- `/api/cron/expire-orders` every 5 minutes;
- `/api/cron/daily` at 08:00 IST (low-stock digest).

Both require `Authorization: Bearer $CRON_SECRET`. On Vercel Hobby, cron jobs run at most once a day. See [CHECKOUT.md](CHECKOUT.md#the-expiry-job).

## Tests

- **Unit tests:**
  - `src/lib/documents/documents.test.ts`: amount in words, the GST split, the PDFs.
  - `src/lib/services/shipping.test.ts`: Shiprocket against a stand-in API (token reuse and re-login, booking order, 404 → not serviceable).
  - `src/emails/*.test.ts`.
  - `src/lib/security/rate-limit.test.ts`.
- **Integration (`tests/integration/orders.test.ts`):**
  - shipments and tracking;
  - Shiprocket booking;
  - cancellation and restocking;
  - full, partial, failed-then-retried and COD refunds;
  - notifications sent exactly once;
  - guest tracking.
- **End-to-end (`tests/e2e/orders.spec.ts`):**
  - tracking with the wrong contact, then the right one;
  - invoice download;
  - webhook and cron endpoints refuse unauthenticated calls.
