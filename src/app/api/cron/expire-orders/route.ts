import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { expireStaleOrders } from "@/lib/checkout/service";
import { getDb } from "@/lib/db/client";

/**
 * Releases stock held for orders nobody paid for. Scheduled in vercel.json; Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`.
 */
function authorised(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorised(request)) return Response.json({ error: "unauthorised" }, { status: 401 });
  const result = await expireStaleOrders(getDb());
  if (result.released > 0) revalidateTag("catalog", "max");
  return Response.json(result);
}
