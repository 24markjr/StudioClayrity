import "server-only";
import { asc, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { orderConfirmationEmail } from "../../emails/order-confirmation";
import { getDb } from "../db/client";
import { orderItems, orders } from "../db/schema";
import { getServices } from "../services";
import { sendOnce } from "../services/email";
import type { PaymentOutcome } from "./service";

/**
 * Side effects once an order is confirmed (paid online or cash on delivery):
 *  - the confirmation email, sent at most once per order however many times this runs
 *  - fresh stock on the affected product pages
 * Failures here never undo the order; the email is retried on the next call.
 */
export async function afterOrderConfirmed(orderId: string, productSlugs: string[]) {
  for (const slug of productSlugs) revalidateTag(`product:${slug}`, { expire: 0 });
  if (productSlugs.length) revalidateTag("catalog", "max");

  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return;
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.createdAt));
  const message = orderConfirmationEmail(
    order,
    items,
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://studioclayrity.com",
  );
  await sendOnce(db, getServices().email, {
    dedupeKey: `order:${order.id}:confirmation`,
    template: "order-confirmation",
    message: { to: order.email, ...message },
  });
}

/** Run the follow-up for a payment outcome, if it confirmed an order. */
export async function afterPaymentOutcome(outcome: PaymentOutcome | { kind: string }) {
  if (
    outcome.kind === "paid" &&
    "orderId" in outcome &&
    !("alreadyProcessed" in outcome && outcome.alreadyProcessed)
  ) {
    await afterOrderConfirmed(outcome.orderId, "slugs" in outcome ? outcome.slugs : []);
  }
}
