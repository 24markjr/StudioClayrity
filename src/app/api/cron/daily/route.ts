import { getDb } from "@/lib/db/client";
import { sendLowStockDigest } from "@/lib/orders/notify";
import { getServices } from "@/lib/services";
import { matchesSecret } from "@/lib/security/shared-secret";

/** Daily jobs (vercel.json): the owner's low-stock summary. At most one email per day. */
export async function GET(request: Request) {
  if (
    !matchesSecret(
      request.headers.get("authorization"),
      process.env.CRON_SECRET && `Bearer ${process.env.CRON_SECRET}`,
    )
  ) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  const lowStock = await sendLowStockDigest(
    getDb(),
    getServices().email,
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://studioclayrity.com",
    process.env.OWNER_NOTIFICATION_EMAIL,
  );
  return Response.json({ lowStock });
}
