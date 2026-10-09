import { stateName } from "../lib/domain/india";
import { formatMoney } from "../lib/utils/money";

/**
 * Order confirmation email. Deliberately simple, table-free HTML that renders in every
 * client; the full branded templates arrive in Phase 7. All content is escaped.
 */

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

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function orderConfirmationEmail(order: Order, items: Item[], siteUrl: string) {
  const isCod = order.paymentMethod === "cod";
  const subject = `Your Studio Clayrity order ${order.publicRef}`;
  const a = order.shippingAddress;
  const address = [
    a.fullName,
    a.line1,
    a.line2,
    `${a.city}, ${stateName(a.stateCode) ?? a.stateCode} ${a.pincode}`,
  ]
    .filter(Boolean)
    .join("\n");

  const rows: Array<[string, string]> = [["Subtotal", formatMoney(order.subtotal)]];
  if (order.discountTotal)
    rows.push([
      `Discount${order.couponCode ? ` (${order.couponCode})` : ""}`,
      `− ${formatMoney(order.discountTotal)}`,
    ]);
  if (order.giftWrapTotal) rows.push(["Gift wrap", formatMoney(order.giftWrapTotal)]);
  rows.push(["Shipping", order.shippingTotal ? formatMoney(order.shippingTotal) : "Free"]);
  if (order.codFee) rows.push(["Cash on delivery fee", formatMoney(order.codFee)]);
  rows.push([isCod ? "To pay on delivery" : "Total paid", formatMoney(order.total)]);

  const intro = isCod
    ? "Thank you for your order. Please keep the amount below ready when your parcel arrives."
    : "Thank you — your payment has been received and your order is confirmed.";

  const text = [
    `Order ${order.publicRef}`,
    "",
    intro,
    "",
    ...items.map(
      (i) =>
        `${i.quantity} × ${i.productName}${i.variantName ? ` (${i.variantName})` : ""} — ${formatMoney(i.lineTotal)}`,
    ),
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    `Includes GST of ${formatMoney(order.taxTotal)}.`,
    "",
    "Delivering to:",
    address,
    "",
    "We'll email you again when your order ships. Reply to this email if you have any questions.",
    "",
    "Studio Clayrity",
    siteUrl,
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f7f5f0;color:#272622;font-family:Georgia,serif">
<div style="max-width:560px;margin:0 auto;background:#fcfbf8;padding:32px">
<p style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#66625a;margin:0">Studio Clayrity</p>
<h1 style="font-weight:normal;font-size:28px;margin:16px 0 8px">Order ${escape(order.publicRef)}</h1>
<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#66625a">${escape(intro)}</p>
<hr style="border:0;border-top:1px solid #e5e0d7;margin:24px 0">
${items
  .map(
    (
      i,
    ) => `<p style="font-family:Arial,sans-serif;font-size:15px;margin:0 0 8px;display:flex;justify-content:space-between">
<span>${i.quantity} × ${escape(i.productName)}${i.variantName ? ` <span style="color:#66625a">(${escape(i.variantName)})</span>` : ""}</span>
<span style="float:right">${escape(formatMoney(i.lineTotal))}</span></p>`,
  )
  .join("\n")}
<hr style="border:0;border-top:1px solid #e5e0d7;margin:24px 0">
${rows
  .map(
    ([k, v], idx) =>
      `<p style="font-family:Arial,sans-serif;font-size:${idx === rows.length - 1 ? 17 : 14}px;margin:0 0 6px;${idx === rows.length - 1 ? "font-weight:bold" : "color:#66625a"}">${escape(k)}<span style="float:right">${escape(v)}</span></p>`,
  )
  .join("\n")}
<p style="font-family:Arial,sans-serif;font-size:12px;color:#66625a;margin:8px 0 0">Includes GST of ${escape(formatMoney(order.taxTotal))}.</p>
<hr style="border:0;border-top:1px solid #e5e0d7;margin:24px 0">
<p style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#66625a;margin:0 0 8px">Delivering to</p>
<p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;white-space:pre-line;margin:0">${escape(address)}</p>
<p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#66625a;margin:24px 0 0">We'll email you again when your order ships. Reply to this email if you have any questions.</p>
</div></body></html>`;

  return { subject, text, html };
}
