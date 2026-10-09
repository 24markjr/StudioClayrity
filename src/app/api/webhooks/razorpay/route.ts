import { afterPaymentOutcome, sendOrderNotifications } from "@/lib/checkout/effects";
import { handleRazorpayWebhook } from "@/lib/checkout/service";
import { getDb } from "@/lib/db/client";
import { getServices } from "@/lib/services";
import { IntegrationNotConfiguredError } from "@/lib/services/errors";

/**
 * Razorpay webhook — the source of truth for payments.
 * Configure in Razorpay: URL https://<site>/api/webhooks/razorpay, events payment.captured,
 * payment.failed, order.paid; secret = RAZORPAY_WEBHOOK_SECRET.
 *
 * 2xx = handled (or a duplicate). 401 = bad signature. 5xx = temporary problem, so Razorpay
 * retries — processing is idempotent, so retries are safe.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const result = await handleRazorpayWebhook(getDb(), getServices().payment, {
      rawBody,
      signature: request.headers.get("x-razorpay-signature"),
      eventId: request.headers.get("x-razorpay-event-id"),
    });
    if (result.outcome)
      await afterPaymentOutcome(result.outcome).catch((error) =>
        console.error("Payment follow-up failed", error),
      );
    if (result.notifications?.length)
      await sendOrderNotifications(result.notifications).catch((error) =>
        console.error("Refund email failed", error),
      );
    return Response.json(
      { ok: result.status === 200, duplicate: result.duplicate ?? false },
      { status: result.status },
    );
  } catch (error) {
    if (error instanceof IntegrationNotConfiguredError) {
      return Response.json({ error: "not_configured" }, { status: 503 });
    }
    console.error("Razorpay webhook failed", error);
    return Response.json({ error: "processing_failed" }, { status: 500 });
  }
}
