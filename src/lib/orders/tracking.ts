import { asc, eq, sql } from "drizzle-orm";
import type { Executor } from "../db/create";
import { orderEvents, orderItems, orders, shipments } from "../db/schema";
import { normaliseIndianMobile } from "../domain/india";
import type { OrderStatus } from "../domain/order-status";

/**
 * Guest order tracking: order reference + the email or phone used at checkout. The answer
 * is the same "not found" whether the reference or the contact is wrong, so references
 * can't be probed for valid ones.
 */

/** Customer-facing milestones. Internal steps (e.g. payment retries) are left out. */
const milestone: Partial<Record<OrderStatus, string>> = {
  pending_payment: "Order placed",
  paid: "Payment confirmed",
  confirmed_cod: "Order confirmed (cash on delivery)",
  processing: "Being prepared",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refund_pending: "Refund in progress",
  refunded: "Refunded",
  return_requested: "Return requested",
  return_approved: "Return approved",
  returned: "Returned",
};

export type TrackingResult = {
  orderRef: string;
  status: OrderStatus;
  placedAt: Date;
  timeline: Array<{ label: string; at: Date }>;
  shipment: { carrier: string | null; awb: string | null; trackingUrl: string | null } | null;
  items: Array<{ name: string; quantity: number }>;
};

export async function findOrderForTracking(
  db: Executor,
  input: { orderRef: string; contact: string },
): Promise<TrackingResult | null> {
  const ref = input.orderRef.trim().toUpperCase();
  const contact = input.contact.trim();
  if (!/^SC-[A-Z0-9]{4,10}$/.test(ref) || !contact) return null;

  const [order] = await db.select().from(orders).where(eq(orders.publicRef, ref));
  if (!order) return null;
  const mobile = normaliseIndianMobile(contact);
  const matches = contact.includes("@")
    ? order.email.toLowerCase() === contact.toLowerCase()
    : mobile !== null && mobile === order.phone;
  if (!matches) return null;

  const [events, items, [shipment]] = await Promise.all([
    db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, order.id))
      .orderBy(asc(orderEvents.createdAt)),
    db
      .select({
        name: orderItems.productName,
        variant: orderItems.variantName,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id)),
    db
      .select()
      .from(shipments)
      .where(eq(shipments.orderId, order.id))
      .orderBy(sql`${shipments.createdAt} desc`)
      .limit(1),
  ]);

  const timeline: TrackingResult["timeline"] = [];
  for (const e of events) {
    const label = milestone[e.toStatus];
    // Keep the first time each milestone was reached
    if (label && !timeline.some((t) => t.label === label)) timeline.push({ label, at: e.createdAt });
  }

  return {
    orderRef: order.publicRef,
    status: order.status,
    placedAt: order.placedAt,
    timeline,
    shipment: shipment
      ? { carrier: shipment.carrier, awb: shipment.awb, trackingUrl: shipment.trackingUrl }
      : null,
    items: items.map((i) => ({
      name: i.variant ? `${i.name} (${i.variant})` : i.name,
      quantity: i.quantity,
    })),
  };
}
