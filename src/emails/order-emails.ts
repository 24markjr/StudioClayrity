import { stateName } from "../lib/domain/india";
import { formatMoney } from "../lib/utils/money";
import { renderEmail, type RenderedEmail } from "./layout";

/**
 * Transactional emails after the order confirmation. Content states facts from the order
 * and makes no promises (e.g. no delivery dates the courier hasn't given).
 */

type Address = {
  fullName: string;
  line1: string;
  line2?: string | null;
  city: string;
  stateCode: string;
  pincode: string;
};
type OrderLike = {
  publicRef: string;
  email: string;
  shippingAddress: Address;
  total: number;
  paymentMethod: string;
};
type ItemLike = { productName: string; variantName: string | null; quantity: number };

const addressLines = (a: Address) =>
  [a.fullName, a.line1, a.line2, `${a.city}, ${stateName(a.stateCode) ?? a.stateCode} ${a.pincode}`].filter(
    (l): l is string => Boolean(l),
  );

const itemRows = (items: ItemLike[]) =>
  items.map((i) => ({
    label: `${i.quantity} × ${i.productName}${i.variantName ? ` (${i.variantName})` : ""}`,
    value: "",
  }));

const trackLink = (siteUrl: string, ref: string) => `${siteUrl}/track-order?ref=${encodeURIComponent(ref)}`;

export function orderShippedEmail(
  order: OrderLike,
  items: ItemLike[],
  shipment: { carrier: string | null; awb: string | null; trackingUrl: string | null },
  siteUrl: string,
): RenderedEmail {
  const cod = order.paymentMethod === "cod";
  return renderEmail(
    {
      subject: `Your order ${order.publicRef} is on its way`,
      preheader: shipment.carrier ? `Shipped with ${shipment.carrier}.` : "Your order has shipped.",
      heading: "Your order is on its way",
      paragraphs: [
        shipment.carrier && shipment.awb
          ? `It's travelling with ${shipment.carrier}. Tracking number: ${shipment.awb}.`
          : "Your order has left the studio.",
        "Every piece has been packed with care for the journey. If anything arrives damaged, please photograph the parcel and the piece and reply to this email — see our returns policy for details.",
        ...(cod ? [`Please keep ${formatMoney(order.total)} ready for the courier.`] : []),
      ],
      cta: { label: "Track your order", href: shipment.trackingUrl ?? trackLink(siteUrl, order.publicRef) },
      rows: itemRows(items),
      block: { title: "Delivering to", lines: addressLines(order.shippingAddress) },
    },
    siteUrl,
  );
}

export function orderOutForDeliveryEmail(order: OrderLike, siteUrl: string): RenderedEmail {
  return renderEmail(
    {
      subject: `Your order ${order.publicRef} is out for delivery`,
      preheader: "It should reach you today.",
      heading: "Out for delivery",
      paragraphs: [
        "The courier expects to deliver your order today.",
        ...(order.paymentMethod === "cod" ? [`Please keep ${formatMoney(order.total)} ready.`] : []),
      ],
      cta: { label: "Track your order", href: trackLink(siteUrl, order.publicRef) },
    },
    siteUrl,
  );
}

export function orderDeliveredEmail(order: OrderLike, siteUrl: string): RenderedEmail {
  return renderEmail(
    {
      subject: `Your order ${order.publicRef} has been delivered`,
      preheader: "We hope it's everything you imagined.",
      heading: "Delivered",
      paragraphs: [
        "Your order has been delivered. We hope each piece finds its place.",
        "If anything arrived damaged, please reply to this email with photos of the parcel and the piece. Our returns policy explains what happens next.",
      ],
      cta: { label: "Returns and breakage", href: `${siteUrl}/policies/returns` },
    },
    siteUrl,
  );
}

export function orderCancelledEmail(
  order: OrderLike,
  siteUrl: string,
  refundExpected: boolean,
): RenderedEmail {
  return renderEmail(
    {
      subject: `Your order ${order.publicRef} has been cancelled`,
      preheader: refundExpected ? "Your refund is being processed." : "Nothing more is due.",
      heading: "Your order has been cancelled",
      paragraphs: [
        refundExpected
          ? `We're refunding ${formatMoney(order.total)} to your original payment method. We'll email you as soon as the refund has been issued.`
          : "Nothing has been charged and nothing more is due.",
        "If you didn't ask for this, or have any questions, just reply to this email.",
      ],
    },
    siteUrl,
  );
}

export function refundProcessedEmail(order: OrderLike, amount: number, siteUrl: string): RenderedEmail {
  return renderEmail(
    {
      subject: `Refund of ${formatMoney(amount)} for order ${order.publicRef}`,
      preheader: "Your refund has been issued.",
      heading: "Your refund has been issued",
      paragraphs: [
        `We've refunded ${formatMoney(amount)} to your original payment method.`,
        "Depending on your bank, it can take a few working days to appear on your statement. If you can't see it, reply to this email and we'll help.",
      ],
    },
    siteUrl,
  );
}

export function ownerNewOrderEmail(
  order: OrderLike & { isTest: boolean },
  items: ItemLike[],
  siteUrl: string,
): RenderedEmail {
  return renderEmail(
    {
      subject: `${order.isTest ? "[TEST] " : ""}New order ${order.publicRef} · ${formatMoney(order.total)}`,
      preheader: `${items.reduce((s, i) => s + i.quantity, 0)} item(s), ${order.paymentMethod === "cod" ? "cash on delivery" : "paid online"}.`,
      heading: `New order ${order.publicRef}`,
      paragraphs: [
        `${order.paymentMethod === "cod" ? "Cash on delivery" : "Paid online"} · ${formatMoney(order.total)}${order.isTest ? " · test order" : ""}`,
        "Pack it with care and add the tracking number when it ships.",
      ],
      rows: itemRows(items),
      block: { title: "Ship to", lines: addressLines(order.shippingAddress) },
      footer: "Sent to the store owner.",
    },
    siteUrl,
  );
}

export function lowStockDigestEmail(
  rows: Array<{ name: string; sku: string; available: number; threshold: number }>,
  siteUrl: string,
): RenderedEmail {
  return renderEmail(
    {
      subject: `Low stock: ${rows.length} ${rows.length === 1 ? "piece" : "pieces"}`,
      preheader: rows
        .slice(0, 3)
        .map((r) => r.name)
        .join(", "),
      heading: "Running low",
      paragraphs: ["These pieces are at or below their low-stock level."],
      rows: rows.map((r) => ({ label: `${r.name} — ${r.sku}`, value: `${r.available} left` })),
      footer: "Daily summary sent to the store owner.",
    },
    siteUrl,
  );
}

export function backInStockEmail(
  product: { name: string; slug: string; variantName: string | null },
  siteUrl: string,
): RenderedEmail {
  const label = `${product.name}${product.variantName ? ` (${product.variantName})` : ""}`;
  return renderEmail(
    {
      subject: `${product.name} is available again`,
      preheader: "You asked us to let you know.",
      heading: `${label} is available again`,
      paragraphs: [
        "You asked us to let you know when this piece was back. Quantities are limited, so it may not be available for long.",
      ],
      cta: { label: "View the piece", href: `${siteUrl}/products/${product.slug}` },
      footer:
        "You're receiving this one-off email because you asked to be notified. We won't email you about this piece again.",
    },
    siteUrl,
  );
}
