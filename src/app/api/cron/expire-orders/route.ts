import { revalidateTag } from "next/cache";
import { expireStaleOrders } from "@/lib/checkout/service";
import { getDb } from "@/lib/db/client";
import { matchesSecret } from "@/lib/security/shared-secret";

/**
 * Releases stock held for orders nobody paid for. Scheduled in vercel.json; Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!matchesSecret(request.headers.get("authorization"), secret && `Bearer ${secret}`)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  const result = await expireStaleOrders(getDb());
  if (result.released > 0) revalidateTag("catalog", "max");
  return Response.json(result);
}
