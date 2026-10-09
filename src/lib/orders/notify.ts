import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  backInStockEmail,
  lowStockDigestEmail,
  orderCancelledEmail,
  orderDeliveredEmail,
  orderOutForDeliveryEmail,
  orderShippedEmail,
  ownerNewOrderEmail,
  refundProcessedEmail,
} from "../../emails/order-emails";
import type { Database } from "../db/create";
import { backInStockRequests, inventory, orderItems, orders, products, productVariants } from "../db/schema";
import { sendOnce, type EmailProvider } from "../services/email";
import { latestShipment, type Notification } from "./lifecycle";

/**
 * Turns lifecycle notifications into emails. Every message has a dedupe key, so retries
 * (webhooks, double clicks) never send twice. Failures are recorded in email_deliveries and
 * never undo the order change that triggered them.
 */

async function buildMessage(
  db: Database,
  order: typeof orders.$inferSelect,
  n: Notification,
  siteUrl: string,
) {
  switch (n.kind) {
    case "shipped": {
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id))
        .orderBy(asc(orderItems.createdAt));
      const shipment = await latestShipment(db, order.id);
      return orderShippedEmail(
        order,
        items,
        {
          carrier: shipment?.carrier ?? null,
          awb: shipment?.awb ?? null,
          trackingUrl: shipment?.trackingUrl ?? null,
        },
        siteUrl,
      );
    }
    case "out_for_delivery":
      return orderOutForDeliveryEmail(order, siteUrl);
    case "delivered":
      return orderDeliveredEmail(order, siteUrl);
    case "cancelled":
      return orderCancelledEmail(order, siteUrl, n.refundExpected);
    case "refund_processed":
      return refundProcessedEmail(order, n.amount, siteUrl);
  }
}

export async function deliverNotification(
  db: Database,
  email: EmailProvider,
  siteUrl: string,
  n: Notification,
) {
  const [order] = await db.select().from(orders).where(eq(orders.id, n.orderId));
  if (!order) return "skipped" as const;

  const message = await buildMessage(db, order, n, siteUrl);
  const dedupeKey =
    n.kind === "refund_processed" ? `refund:${n.refundId}:processed` : `order:${order.id}:${n.kind}`;
  return sendOnce(db, email, {
    dedupeKey,
    template: `order-${n.kind}`,
    message: { to: order.email, ...message },
  });
}

export async function deliverNotifications(
  db: Database,
  email: EmailProvider,
  siteUrl: string,
  notifications: Notification[],
) {
  const results = [];
  for (const n of notifications) {
    try {
      results.push(await deliverNotification(db, email, siteUrl, n));
    } catch (error) {
      console.error("Notification failed", n.kind, error);
      results.push("failed" as const);
    }
  }
  return results;
}

/** The store owner's "new order" email. */
export async function notifyOwnerOfOrder(
  db: Database,
  email: EmailProvider,
  siteUrl: string,
  orderId: string,
  ownerEmail: string | undefined,
) {
  if (!ownerEmail) return "skipped" as const;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return "skipped" as const;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  return sendOnce(db, email, {
    dedupeKey: `order:${orderId}:owner-alert`,
    template: "owner-new-order",
    message: { to: ownerEmail, ...ownerNewOrderEmail(order, items, siteUrl) },
  });
}

/** Tracked variants at or below their low-stock level (available = on hand − held). */
export async function lowStockRows(db: Database) {
  const available = sql<number>`(${inventory.onHand} - ${inventory.reserved})::int`;
  return db
    .select({
      name: products.name,
      variant: productVariants.name,
      sku: productVariants.sku,
      available,
      threshold: inventory.lowStockThreshold,
    })
    .from(inventory)
    .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(
      and(
        eq(productVariants.trackInventory, true),
        eq(productVariants.isActive, true),
        eq(products.status, "published"),
        sql`${inventory.onHand} - ${inventory.reserved} <= ${inventory.lowStockThreshold}`,
      ),
    )
    .orderBy(available, asc(products.name));
}

/** Daily summary to the owner; at most one per calendar day (IST). */
export async function sendLowStockDigest(
  db: Database,
  email: EmailProvider,
  siteUrl: string,
  ownerEmail: string | undefined,
  now = new Date(),
) {
  if (!ownerEmail) return "skipped" as const;
  const rows = await lowStockRows(db);
  if (rows.length === 0) return "skipped" as const;
  const day = new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  return sendOnce(db, email, {
    dedupeKey: `digest:low-stock:${day}`,
    template: "low-stock-digest",
    message: {
      to: ownerEmail,
      ...lowStockDigestEmail(
        rows.map((r) => ({
          name: r.variant ? `${r.name} (${r.variant})` : r.name,
          sku: r.sku,
          available: r.available,
          threshold: r.threshold,
        })),
        siteUrl,
      ),
    },
  });
}

/**
 * Restocked: email everyone waiting for this variant, once each. Called by the admin's
 * stock adjustment (Phase 8) after stock goes from 0 to more.
 */
export async function notifyBackInStock(
  db: Database,
  email: EmailProvider,
  siteUrl: string,
  variantId: string,
) {
  const [variant] = await db
    .select({
      name: products.name,
      slug: products.slug,
      variantName: productVariants.name,
      track: productVariants.trackInventory,
      onHand: inventory.onHand,
      reserved: inventory.reserved,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(and(eq(productVariants.id, variantId), eq(products.status, "published")));
  if (!variant) return 0;
  if (variant.track && (variant.onHand ?? 0) - (variant.reserved ?? 0) <= 0) return 0;

  const waiting = await db
    .select()
    .from(backInStockRequests)
    .where(and(eq(backInStockRequests.variantId, variantId), isNull(backInStockRequests.notifiedAt)));
  let sent = 0;
  for (const request of waiting) {
    const result = await sendOnce(db, email, {
      dedupeKey: `back-in-stock:${request.id}`,
      template: "back-in-stock",
      message: { to: request.email, ...backInStockEmail(variant, siteUrl) },
    });
    if (result !== "failed") {
      await db
        .update(backInStockRequests)
        .set({ notifiedAt: new Date() })
        .where(eq(backInStockRequests.id, request.id));
      if (result === "sent") sent++;
    }
  }
  return sent;
}
