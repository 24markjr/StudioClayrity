import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { amountInWords } from "./amount-in-words";
import type { InvoiceData } from "./invoice-data";

/**
 * GST invoice and packing slip PDFs, generated on the server with pdf-lib (pure JavaScript,
 * no native dependencies). Built-in fonts can't draw "₹", so amounts are labelled INR.
 * Text outside the font's character set is transliterated (Ā → A) or replaced, never dropped.
 */

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 40;
const INK = rgb(0.153, 0.149, 0.133);
const MUTED = rgb(0.4, 0.384, 0.353);
const LINE = rgb(0.85, 0.82, 0.78);

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (paise: number) => inr.format(paise / 100);
const percent = (bp: number) => `${(bp / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;
const date = (d: Date) =>
  d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

function safeText(font: PDFFont, text: string) {
  const plain = text.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  let out = "";
  for (const ch of plain) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

class Writer {
  page: PDFPage;
  y: number;
  constructor(
    private doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.page = doc.addPage(A4);
    this.y = A4[1] - MARGIN;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN + 40) {
      this.page = this.doc.addPage(A4);
      this.y = A4[1] - MARGIN;
      return true;
    }
    return false;
  }

  text(
    value: string,
    x: number,
    y: number,
    opts: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      align?: "left" | "right";
      width?: number;
    } = {},
  ) {
    const font = opts.bold ? this.bold : this.font;
    const size = opts.size ?? 9;
    const t = safeText(font, value);
    const w = font.widthOfTextAtSize(t, size);
    const drawX = opts.align === "right" && opts.width ? x + opts.width - w : x;
    this.page.drawText(t, { x: drawX, y, size, font, color: opts.color ?? INK });
  }

  /** Split text into lines that fit `width`. */
  wrap(value: string, width: number, size = 9, bold = false) {
    const font = bold ? this.bold : this.font;
    const words = safeText(font, value).split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  rule(y = this.y, color = LINE) {
    this.page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 0.6, color });
  }
}

async function newDoc(title: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor("Studio Clayrity");
  doc.setCreator("studioclayrity.com");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, w: new Writer(doc, font, bold) };
}

function block(w: Writer, x: number, title: string, lines: string[], width: number) {
  let y = w.y;
  w.text(title.toUpperCase(), x, y, { size: 7, color: MUTED });
  y -= 13;
  for (const line of lines) {
    for (const part of w.wrap(line, width)) {
      w.text(part, x, y);
      y -= 12;
    }
  }
  return y;
}

export async function renderInvoicePdf(data: InvoiceData) {
  const { doc, w } = await newDoc(`Tax invoice ${data.invoiceNumber}`);
  const right = A4[0] - MARGIN;
  const contentWidth = A4[0] - MARGIN * 2;

  // Header
  w.text("TAX INVOICE", MARGIN, w.y, { size: 16, bold: true });
  w.text("Original for recipient", right - 150, w.y + 2, {
    size: 8,
    color: MUTED,
    align: "right",
    width: 150,
  });
  w.y -= 26;
  w.text(data.seller.legalName, MARGIN, w.y, { size: 11, bold: true });
  w.y -= 14;
  let leftY = w.y;
  for (const line of w.wrap(data.seller.address || "Address to be confirmed", 260)) {
    w.text(line, MARGIN, leftY, { color: MUTED });
    leftY -= 12;
  }
  w.text(`GSTIN: ${data.seller.gstin || "Not provided"}`, MARGIN, leftY);
  leftY -= 12;
  w.text(`State: ${data.seller.stateName} (${data.seller.stateCode})`, MARGIN, leftY);
  leftY -= 12;

  const meta: Array<[string, string]> = [
    ["Invoice no.", data.invoiceNumber],
    ["Invoice date", date(data.invoiceDate)],
    ["Order", data.orderRef],
    ["Payment", data.paymentMethod],
  ];
  let metaY = w.y;
  for (const [label, value] of meta) {
    w.text(label, right - 210, metaY, { color: MUTED });
    w.text(value, right - 120, metaY, { bold: true, align: "right", width: 120 });
    metaY -= 13;
  }
  w.y = Math.min(leftY, metaY) - 12;
  w.rule();
  w.y -= 16;

  // Parties
  const buyerLines = [data.buyer.name, ...data.buyer.address, `Phone: ${data.buyer.phone}`, data.buyer.email];
  if (data.buyer.gstin) buyerLines.push(`GSTIN: ${data.buyer.gstin}`);
  const yBill = block(w, MARGIN, "Bill to", buyerLines, 240);
  const yShip = block(w, MARGIN + 270, "Ship to", [data.shipTo.name, ...data.shipTo.address], 240);
  w.y = Math.min(yBill, yShip) - 4;
  w.text(`Place of supply: ${data.placeOfSupply}`, MARGIN, w.y, { bold: true });
  w.y -= 18;

  // Table
  const cols = data.intraState
    ? [
        { key: "desc", label: "Description", w: 150 },
        { key: "hsn", label: "HSN/SAC", w: 44 },
        { key: "qty", label: "Qty", w: 24, right: true },
        { key: "rate", label: "Rate", w: 52, right: true },
        { key: "taxable", label: "Taxable", w: 56, right: true },
        { key: "gst", label: "GST", w: 28, right: true },
        { key: "cgst", label: "CGST", w: 50, right: true },
        { key: "sgst", label: "SGST", w: 50, right: true },
        { key: "total", label: "Total", w: 61.28, right: true },
      ]
    : [
        { key: "desc", label: "Description", w: 180 },
        { key: "hsn", label: "HSN/SAC", w: 46 },
        { key: "qty", label: "Qty", w: 26, right: true },
        { key: "rate", label: "Rate", w: 58, right: true },
        { key: "taxable", label: "Taxable", w: 64, right: true },
        { key: "gst", label: "GST", w: 30, right: true },
        { key: "igst", label: "IGST", w: 52, right: true },
        { key: "total", label: "Total", w: 59.28, right: true },
      ];
  const header = () => {
    let x = MARGIN;
    w.page.drawRectangle({
      x: MARGIN,
      y: w.y - 5,
      width: contentWidth,
      height: 18,
      color: rgb(0.94, 0.92, 0.89),
    });
    for (const c of cols) {
      w.text(c.label, x + 3, w.y, {
        size: 7.5,
        bold: true,
        align: c.right ? "right" : "left",
        width: c.w - 6,
      });
      x += c.w;
    }
    w.y -= 20;
  };
  header();

  for (const row of data.rows) {
    const descLines = w.wrap(row.description, cols[0].w - 6, 8.5);
    const height = descLines.length * 11 + 6;
    if (w.ensure(height)) header();
    const values: Record<string, string> = {
      hsn: row.hsn || "—",
      qty: row.quantity === null ? "" : String(row.quantity),
      rate: row.unitPrice === null ? "" : money(row.unitPrice),
      taxable: money(row.taxable),
      gst: percent(row.rateBp),
      cgst: money(row.cgst),
      sgst: money(row.sgst),
      igst: money(row.igst),
      total: money(row.total),
    };
    let x = MARGIN;
    for (const c of cols) {
      if (c.key === "desc") descLines.forEach((line, i) => w.text(line, x + 3, w.y - i * 11, { size: 8.5 }));
      else
        w.text(values[c.key], x + 3, w.y, { size: 8.5, align: c.right ? "right" : "left", width: c.w - 6 });
      x += c.w;
    }
    if (row.discount > 0) {
      w.text(`Includes discount of ${money(row.discount)}`, MARGIN + 3, w.y - descLines.length * 11, {
        size: 7,
        color: MUTED,
      });
      w.y -= 9;
    }
    w.y -= height;
    // Rule sits clear of the next row (text rises ~7pt above its baseline)
    w.rule(w.y + 10);
    w.y -= 4;
  }

  // Totals
  w.ensure(120);
  w.y -= 8;
  const totals: Array<[string, number]> = [["Taxable value", data.totals.taxable]];
  if (data.intraState) totals.push(["CGST", data.totals.cgst], ["SGST", data.totals.sgst]);
  else totals.push(["IGST", data.totals.igst]);
  for (const [label, value] of totals) {
    w.text(label, right - 220, w.y, { color: MUTED });
    w.text(money(value), right - 100, w.y, { align: "right", width: 100 });
    w.y -= 13;
  }
  w.rule(w.y + 6, INK);
  w.y -= 8;
  w.text("Invoice total (INR)", right - 220, w.y, { bold: true, size: 10 });
  w.text(money(data.totals.total), right - 100, w.y, { bold: true, size: 10, align: "right", width: 100 });
  w.y -= 18;
  for (const line of w.wrap(amountInWords(data.totals.total), contentWidth)) {
    w.text(line, MARGIN, w.y, { color: MUTED });
    w.y -= 12;
  }

  // Footer
  w.ensure(80);
  w.y -= 18;
  w.text("Tax payable on reverse charge: No", MARGIN, w.y, { size: 8, color: MUTED });
  w.y -= 11;
  w.text("Prices include GST. This is a computer-generated invoice.", MARGIN, w.y, { size: 8, color: MUTED });
  w.text(`For ${data.seller.legalName}`, right - 200, w.y + 11, { size: 8, align: "right", width: 200 });
  w.text("Authorised signatory", right - 200, w.y - 22, {
    size: 8,
    color: MUTED,
    align: "right",
    width: 200,
  });

  return doc.save();
}

export type PackingSlipData = {
  orderRef: string;
  date: Date;
  shipTo: { name: string; address: string[] };
  phone: string;
  items: Array<{ description: string; sku: string; quantity: number; lineTotal: number }>;
  /** Gifts: leave prices off the slip */
  hidePrices: boolean;
  giftMessage: string | null;
};

export async function renderPackingSlipPdf(data: PackingSlipData) {
  const { doc, w } = await newDoc(`Packing slip ${data.orderRef}`);
  const right = A4[0] - MARGIN;
  w.text("PACKING SLIP", MARGIN, w.y, { size: 16, bold: true });
  w.text("Studio Clayrity", right - 200, w.y, { size: 11, bold: true, align: "right", width: 200 });
  w.y -= 22;
  w.text(`Order ${data.orderRef} · ${date(data.date)}`, MARGIN, w.y, { color: MUTED });
  w.y -= 24;
  w.y =
    block(w, MARGIN, "Ship to", [data.shipTo.name, ...data.shipTo.address, `Phone: ${data.phone}`], 300) - 10;
  w.rule();
  w.y -= 16;

  w.text("Item", MARGIN, w.y, { bold: true, size: 8 });
  w.text("SKU", MARGIN + 300, w.y, { bold: true, size: 8 });
  w.text("Qty", MARGIN + 400, w.y, { bold: true, size: 8 });
  if (!data.hidePrices)
    w.text("Amount (INR)", right - 90, w.y, { bold: true, size: 8, align: "right", width: 90 });
  w.y -= 16;
  for (const item of data.items) {
    const lines = w.wrap(item.description, 290);
    w.ensure(lines.length * 12 + 8);
    lines.forEach((l, i) => w.text(l, MARGIN, w.y - i * 12));
    w.text(item.sku, MARGIN + 300, w.y, { color: MUTED });
    w.text(String(item.quantity), MARGIN + 400, w.y);
    if (!data.hidePrices) w.text(money(item.lineTotal), right - 90, w.y, { align: "right", width: 90 });
    w.y -= lines.length * 12 + 8;
    w.rule(w.y + 10);
    w.y -= 4;
  }

  if (data.giftMessage) {
    w.ensure(90);
    w.y -= 20;
    w.text("GIFT MESSAGE", MARGIN, w.y, { size: 7, color: MUTED });
    w.y -= 14;
    for (const line of w.wrap(data.giftMessage, 400, 11)) {
      w.text(line, MARGIN, w.y, { size: 11 });
      w.y -= 15;
    }
  }
  w.y -= 24;
  w.text("Thank you. Please keep this slip for any return or breakage claim.", MARGIN, w.y, {
    size: 8,
    color: MUTED,
  });
  return doc.save();
}
