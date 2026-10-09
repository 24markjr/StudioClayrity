import { asc, eq } from "drizzle-orm";
import type { Database } from "../db/create";
import { orderItems, orders } from "../db/schema";
import { getSetting } from "../domain/settings";
import { buildInvoiceData } from "./invoice-data";
import { renderInvoicePdf, renderPackingSlipPdf } from "./pdf";

/** PDFs for a stored order. Callers check who may see the order first. */

export async function invoicePdfForOrder(db: Database, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order?.invoiceNumber) return null;
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.createdAt));
  const [seller, shipping] = await Promise.all([getSetting(db, "seller"), getSetting(db, "shipping")]);
  const data = buildInvoiceData(order, items, seller, shipping.chargesGstRateBp);
  return {
    filename: `invoice-${order.invoiceNumber.replace(/\//g, "-")}.pdf`,
    bytes: await renderInvoicePdf(data),
  };
}

export async function packingSlipPdfForOrder(db: Database, orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.createdAt));
  const a = order.shippingAddress;
  const bytes = await renderPackingSlipPdf({
    orderRef: order.publicRef,
    date: order.placedAt,
    shipTo: {
      name: a.fullName,
      address: [a.line1, a.line2, a.landmark, `${a.city} ${a.pincode}`].filter((l): l is string =>
        Boolean(l),
      ),
    },
    phone: a.phone,
    items: items.map((i) => ({
      description: i.variantName ? `${i.productName} (${i.variantName})` : i.productName,
      sku: i.sku,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
    hidePrices: order.hidePrices,
    giftMessage: order.giftMessage,
  });
  return { filename: `packing-slip-${order.publicRef}.pdf`, bytes };
}
