import "server-only";
import { asc, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { orderConfirmationEmail } from "../../emails/order-confirmation";
import { getDb } from "../db/client";
import { orderItems, orders } from "../db/schema";
import type { Notification } from "../orders/lifecycle";
import { deliverNotifications, notifyOwnerOfOrder } from "../orders/notify";
import { getServices } from "../services";
import { sendOnce } from "../services/email";
import type { PaymentOutcome } from "./service";

/**
 * Side effects once an order changes in a way people should hear about. They run after the
 * database change has committed; failures are logged and never undo the order. Every email
 * is deduplicated, so re-running is always safe.
 */

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "https://studioclayrity.com";

/** Paid online or a cash-on-delivery order placed. */
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
  const email = getServices().email;
  await sendOnce(db, email, {
    dedupeKey: `order:${order.id}:confirmation`,
    template: "order-confirmation",
    message: { to: order.email, ...orderConfirmationEmail(order, items, siteUrl()) },
  });
  await notifyOwnerOfOrder(db, email, siteUrl(), orderId, process.env.OWNER_NOTIFICATION_EMAIL);
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

/** Emails for shipping, delivery, cancellation and refunds. */
export async function sendOrderNotifications(notifications: Notification[]) {
  if (notifications.length === 0) return;
  await deliverNotifications(getDb(), getServices().email, siteUrl(), notifications);
}
