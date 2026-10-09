import { sendOrderNotifications } from "@/lib/checkout/effects";
import { getDb } from "@/lib/db/client";
import { applyTrackingUpdate } from "@/lib/orders/lifecycle";
import { matchesSecret } from "@/lib/security/shared-secret";

/**
 * Shiprocket tracking webhook. Configure in Shiprocket → Settings → API → Webhooks with this
 * URL and SHIPROCKET_WEBHOOK_TOKEN as the token (sent as the x-api-key header).
 * (The path avoids the word "shiprocket", which Shiprocket rejects in webhook URLs.)
 *
 * Updates only move a shipment forward, so repeats and out-of-order deliveries are harmless.
 */
type TrackingPayload = {
  awb?: string | number;
  current_status?: string;
  shipment_status?: string;
  current_timestamp?: string;
};

export async function POST(request: Request) {
  const token = process.env.SHIPROCKET_WEBHOOK_TOKEN;
  if (!token) return Response.json({ error: "not_configured" }, { status: 503 });
  if (!matchesSecret(request.headers.get("x-api-key"), token)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }

  let body: TrackingPayload;
  try {
    body = (await request.json()) as TrackingPayload;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const awb = body.awb ? String(body.awb) : "";
  const status = body.current_status ?? body.shipment_status ?? "";
  if (!awb || !status) return Response.json({ ok: true, ignored: "missing awb or status" });

  const at = body.current_timestamp ? new Date(body.current_timestamp) : undefined;
  try {
    const result = await applyTrackingUpdate(getDb(), {
      awb,
      status,
      at: at && !Number.isNaN(at.getTime()) ? at : undefined,
    });
    await sendOrderNotifications(result.notifications).catch((error) =>
      console.error("Tracking email failed", error),
    );
    return Response.json({ ok: true, applied: result.applied });
  } catch (error) {
    console.error("Tracking webhook failed", error);
    return Response.json({ error: "processing_failed" }, { status: 500 });
  }
}
