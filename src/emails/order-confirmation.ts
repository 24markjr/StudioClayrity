import { stateName } from "../lib/domain/india";
import { formatMoney } from "../lib/utils/money";
import { renderEmail } from "./layout";

/** Order confirmation, sent once when an order is paid or a cash-on-delivery order is placed. */

type Order = {
  publicRef: string;
  paymentMethod: string;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  giftWrapTotal: number;
  codFee: number;
  total: number;
  taxTotal: number;
  couponCode: string | null;
  shippingAddress: {
    fullName: string;
    line1: string;
    line2?: string | null;
    city: string;
    stateCode: string;
    pincode: string;
  };
};

type Item = { productName: string; variantName: string | null; quantity: number; lineTotal: number };

export function orderConfirmationEmail(order: Order, items: Item[], siteUrl: string) {
  const isCod = order.paymentMethod === "cod";
  const a = order.shippingAddress;

  const rows: Array<{ label: string; value: string; strong?: boolean }> = items.map((i) => ({
    label: `${i.quantity} × ${i.productName}${i.variantName ? ` (${i.variantName})` : ""}`,
    value: formatMoney(i.lineTotal),
  }));
  rows.push({ label: "Subtotal", value: formatMoney(order.subtotal) });
  if (order.discountTotal) {
    rows.push({
      label: `Discount${order.couponCode ? ` (${order.couponCode})` : ""}`,
      value: `− ${formatMoney(order.discountTotal)}`,
    });
  }
  if (order.giftWrapTotal) rows.push({ label: "Gift wrap", value: formatMoney(order.giftWrapTotal) });
  rows.push({ label: "Shipping", value: order.shippingTotal ? formatMoney(order.shippingTotal) : "Free" });
  if (order.codFee) rows.push({ label: "Cash on delivery fee", value: formatMoney(order.codFee) });
  rows.push({
    label: isCod ? "To pay on delivery" : "Total paid",
    value: formatMoney(order.total),
    strong: true,
  });
  rows.push({ label: "Includes GST", value: formatMoney(order.taxTotal) });

  return renderEmail(
    {
      subject: `Your Studio Clayrity order ${order.publicRef}`,
      preheader: isCod ? "Your order is placed." : "Your payment is received and your order is confirmed.",
      heading: `Thank you — order ${order.publicRef}`,
      paragraphs: [
        isCod
          ? "Your order is placed. Please keep the amount below ready when your parcel arrives."
          : "Your payment has been received and your order is confirmed.",
        "We'll email you again when it ships.",
      ],
      cta: {
        label: "Track your order",
        href: `${siteUrl}/track-order?ref=${encodeURIComponent(order.publicRef)}`,
      },
      rows,
      block: {
        title: "Delivering to",
        lines: [
          a.fullName,
          a.line1,
          a.line2,
          `${a.city}, ${stateName(a.stateCode) ?? a.stateCode} ${a.pincode}`,
        ].filter((l): l is string => Boolean(l)),
      },
    },
    siteUrl,
  );
}
