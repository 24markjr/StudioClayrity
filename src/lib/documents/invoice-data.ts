import { allocateProportionally } from "../domain/pricing";
import { stateName } from "../domain/india";

/**
 * The figures on a GST tax invoice, derived from the stored order (never recomputed from
 * the catalogue). Every column adds up exactly to the order's stored totals.
 */

export type InvoiceOrder = {
  publicRef: string;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  placedAt: Date;
  paymentMethod: string;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  giftWrapTotal: number;
  codFee: number;
  total: number;
  taxTotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  sellerStateCode: string;
  billingGstin: string | null;
  email: string;
  shippingAddress: AddressLike;
  billingAddress: AddressLike;
};

type AddressLike = {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  stateCode: string;
  pincode: string;
};

export type InvoiceItem = {
  productName: string;
  variantName: string | null;
  sku: string;
  hsnCode: string | null;
  gstRateBp: number;
  unitPrice: number;
  quantity: number;
  discount: number;
  lineTotal: number;
  taxAmount: number;
};

export type InvoiceSeller = { legalName: string; gstin: string; address: string; stateCode: string };

export type InvoiceRow = {
  description: string;
  hsn: string;
  quantity: number | null;
  /** GST-inclusive unit price */
  unitPrice: number | null;
  discount: number;
  /** Value before tax */
  taxable: number;
  rateBp: number;
  cgst: number;
  sgst: number;
  igst: number;
  /** GST-inclusive line total */
  total: number;
};

export type InvoiceData = {
  invoiceNumber: string;
  invoiceDate: Date;
  orderRef: string;
  seller: InvoiceSeller & { stateName: string };
  buyer: { name: string; gstin: string | null; address: string[]; phone: string; email: string };
  shipTo: { name: string; address: string[] };
  placeOfSupply: string;
  intraState: boolean;
  rows: InvoiceRow[];
  totals: { taxable: number; cgst: number; sgst: number; igst: number; total: number };
  paymentMethod: string;
};

function addressLines(a: AddressLike) {
  return [
    a.line1,
    a.line2,
    a.landmark,
    `${a.city}, ${stateName(a.stateCode) ?? a.stateCode} ${a.pincode}`,
  ].filter((l): l is string => Boolean(l));
}

export function buildInvoiceData(
  order: InvoiceOrder,
  items: InvoiceItem[],
  seller: InvoiceSeller,
  chargesGstRateBp: number,
): InvoiceData {
  if (!order.invoiceNumber || !order.invoiceDate) throw new Error("This order has no invoice yet");
  const intraState = order.sellerStateCode === order.shippingAddress.stateCode;

  // Lines for goods, then charges (shipping, gift wrap, COD fee)
  const charges = [
    { description: "Shipping and handling", amount: order.shippingTotal },
    { description: "Gift wrap", amount: order.giftWrapTotal },
    { description: "Cash on delivery fee", amount: order.codFee },
  ].filter((c) => c.amount > 0);
  const itemTax = items.reduce((s, i) => s + i.taxAmount, 0);
  const chargesTax = order.taxTotal - itemTax;
  const chargeTaxes = allocateProportionally(
    Math.max(0, chargesTax),
    charges.map((c) => c.amount),
  );

  const lineTaxes = [...items.map((i) => i.taxAmount), ...chargeTaxes];
  const { cgst, sgst, igst } = splitLineTaxes(lineTaxes, order);

  const rows: InvoiceRow[] = [
    ...items.map((item, i) => ({
      description: `${item.productName}${item.variantName ? ` (${item.variantName})` : ""} — ${item.sku}`,
      hsn: item.hsnCode ?? "",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      taxable: item.lineTotal - item.taxAmount,
      rateBp: item.gstRateBp,
      cgst: cgst[i],
      sgst: sgst[i],
      igst: igst[i],
      total: item.lineTotal,
    })),
    ...charges.map((charge, j) => {
      const i = items.length + j;
      return {
        description: charge.description,
        hsn: "",
        quantity: null,
        unitPrice: null,
        discount: 0,
        taxable: charge.amount - chargeTaxes[j],
        rateBp: chargesGstRateBp,
        cgst: cgst[i],
        sgst: sgst[i],
        igst: igst[i],
        total: charge.amount,
      };
    }),
  ];

  const sum = (key: "taxable" | "cgst" | "sgst" | "igst" | "total") => rows.reduce((s, r) => s + r[key], 0);
  const billing = order.billingAddress;

  return {
    invoiceNumber: order.invoiceNumber,
    invoiceDate: order.invoiceDate,
    orderRef: order.publicRef,
    seller: { ...seller, stateName: stateName(seller.stateCode) ?? seller.stateCode },
    buyer: {
      name: billing.fullName,
      gstin: order.billingGstin,
      address: addressLines(billing),
      phone: billing.phone,
      email: order.email,
    },
    shipTo: { name: order.shippingAddress.fullName, address: addressLines(order.shippingAddress) },
    placeOfSupply: `${stateName(order.shippingAddress.stateCode) ?? ""} (${order.shippingAddress.stateCode})`,
    intraState,
    rows,
    totals: {
      taxable: sum("taxable"),
      cgst: sum("cgst"),
      sgst: sum("sgst"),
      igst: sum("igst"),
      total: sum("total"),
    },
    paymentMethod: order.paymentMethod === "cod" ? "Cash on delivery" : "Paid online",
  };
}

/**
 * Split each line's tax into CGST/SGST (or IGST) so that every row adds up to its own tax
 * AND every column adds up to the order's stored totals. Halves are floored per line; the
 * order-level CGST (also floored, but on the total) can be a few paise higher, so single
 * paise move from SGST to CGST on odd-taxed lines until the columns match.
 */
export function splitLineTaxes(lineTaxes: number[], order: { cgst: number; sgst: number; igst: number }) {
  if (order.igst > 0 || (order.cgst === 0 && order.sgst === 0)) {
    return { cgst: lineTaxes.map(() => 0), sgst: lineTaxes.map(() => 0), igst: [...lineTaxes] };
  }
  const cgst = lineTaxes.map((t) => Math.floor(t / 2));
  const sgst = lineTaxes.map((t, i) => t - cgst[i]);
  let diff = order.cgst - cgst.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lineTaxes.length && diff > 0; i++) {
    if (sgst[i] > cgst[i]) {
      cgst[i] += 1;
      sgst[i] -= 1;
      diff -= 1;
    }
  }
  for (let i = 0; i < lineTaxes.length && diff < 0; i++) {
    if (cgst[i] > sgst[i] - 1 && cgst[i] > 0) {
      cgst[i] -= 1;
      sgst[i] += 1;
      diff += 1;
    }
  }
  return { cgst, sgst, igst: lineTaxes.map(() => 0) };
}
