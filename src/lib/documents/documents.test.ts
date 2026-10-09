import { describe, expect, it } from "vitest";
import { amountInWords, numberInWords } from "./amount-in-words";
import { buildInvoiceData, type InvoiceItem, type InvoiceOrder } from "./invoice-data";
import { renderInvoicePdf, renderPackingSlipPdf } from "./pdf";

describe("amount in words (Indian system)", () => {
  it.each([
    [0, "Zero"],
    [7, "Seven"],
    [19, "Nineteen"],
    [45, "Forty Five"],
    [100, "One Hundred"],
    [1_005, "One Thousand Five"],
    [12_500, "Twelve Thousand Five Hundred"],
    [1_00_000, "One Lakh"],
    [12_34_567, "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven"],
    [1_00_00_000, "One Crore"],
    [25_07_00_001, "Twenty Five Crore Seven Lakh One"],
  ])("%i → %s", (n, words) => {
    expect(numberInWords(n)).toBe(words);
  });

  it("formats rupees and paise", () => {
    expect(amountInWords(1_250_050)).toBe("Rupees Twelve Thousand Five Hundred and Fifty Paise Only");
    expect(amountInWords(850_000)).toBe("Rupees Eight Thousand Five Hundred Only");
  });
});

const address = {
  fullName: "Ananya Rao",
  phone: "9876543210",
  line1: "12 Lavelle Road",
  city: "Bengaluru",
  stateCode: "29",
  pincode: "560001",
};

function order(overrides: Partial<InvoiceOrder> = {}): InvoiceOrder {
  return {
    publicRef: "SC-7K3Q9X",
    invoiceNumber: "SC/26-27/0001",
    invoiceDate: new Date("2026-10-09T10:00:00Z"),
    placedAt: new Date("2026-10-09T09:59:00Z"),
    paymentMethod: "razorpay",
    subtotal: 1_400_000,
    discountTotal: 100_000,
    shippingTotal: 50_000,
    giftWrapTotal: 25_000,
    codFee: 0,
    total: 1_375_000,
    taxTotal: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    sellerStateCode: "29",
    billingGstin: null,
    email: "a@example.com",
    shippingAddress: address,
    billingAddress: address,
    ...overrides,
  };
}

// Two lines after a ₹1,000 discount: 8,500 → 7,892.86 and 5,500 → 5,107.14 (proportional)
const items: InvoiceItem[] = [
  {
    productName: "Travertine Tray",
    variantName: "Large",
    sku: "T-L",
    hsnCode: "6802",
    gstRateBp: 1800,
    unitPrice: 850_000,
    quantity: 1,
    discount: 60_714,
    lineTotal: 789_286,
    taxAmount: 120_399,
  },
  {
    productName: "Nero Bowl",
    variantName: null,
    sku: "N-1",
    hsnCode: "6802",
    gstRateBp: 1800,
    unitPrice: 550_000,
    quantity: 1,
    discount: 39_286,
    lineTotal: 510_714,
    taxAmount: 77_906,
  },
];
const chargesTax = Math.round((75_000 * 1800) / 11800); // shipping + gift wrap
const taxTotal = 120_399 + 77_906 + chargesTax;

describe("invoice data", () => {
  const seller = {
    legalName: "Studio Clayrity",
    gstin: "29ABCDE1234F1Z5",
    address: "Bengaluru",
    stateCode: "29",
  };

  it("splits intra-state tax so every column sums to the stored order totals", () => {
    const cgst = Math.floor(taxTotal / 2);
    const data = buildInvoiceData(order({ taxTotal, cgst, sgst: taxTotal - cgst }), items, seller, 1800);
    expect(data.intraState).toBe(true);
    expect(data.rows.map((r) => r.description)).toEqual([
      "Travertine Tray (Large) — T-L",
      "Nero Bowl — N-1",
      "Shipping and handling",
      "Gift wrap",
    ]);
    expect(data.totals.total).toBe(1_375_000);
    expect(data.totals.cgst).toBe(cgst);
    expect(data.totals.sgst).toBe(taxTotal - cgst);
    expect(data.totals.igst).toBe(0);
    expect(data.totals.taxable + data.totals.cgst + data.totals.sgst).toBe(1_375_000);
    for (const row of data.rows) expect(row.taxable + row.cgst + row.sgst + row.igst).toBe(row.total);
  });

  it("uses IGST for another state and names the place of supply", () => {
    const data = buildInvoiceData(
      order({
        taxTotal,
        igst: taxTotal,
        shippingAddress: { ...address, city: "Mumbai", stateCode: "27", pincode: "400001" },
      }),
      items,
      seller,
      1800,
    );
    expect(data.intraState).toBe(false);
    expect(data.totals.igst).toBe(taxTotal);
    expect(data.placeOfSupply).toBe("Maharashtra (27)");
  });

  it("refuses an order without an invoice number", () => {
    expect(() => buildInvoiceData(order({ invoiceNumber: null }), items, seller, 1800)).toThrow();
  });

  it("renders a PDF invoice and a packing slip", async () => {
    const cgst = Math.floor(taxTotal / 2);
    const data = buildInvoiceData(
      order({
        taxTotal,
        cgst,
        sgst: taxTotal - cgst,
        billingAddress: { ...address, fullName: "Ānanyā Rāo ★" },
      }),
      items,
      seller,
      1800,
    );
    const pdf = await renderInvoicePdf(data);
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);

    const slip = await renderPackingSlipPdf({
      orderRef: "SC-7K3Q9X",
      date: new Date("2026-10-09"),
      shipTo: data.shipTo,
      phone: "9876543210",
      items: items.map((i) => ({
        description: `${i.productName}`,
        sku: i.sku,
        quantity: i.quantity,
        lineTotal: i.lineTotal,
      })),
      hidePrices: true,
      giftMessage: "Happy housewarming",
    });
    expect(Buffer.from(slip.subarray(0, 5)).toString()).toBe("%PDF-");
  });
});

describe("splitLineTaxes", () => {
  it("keeps rows and columns exact for many odd-taxed lines", async () => {
    const { splitLineTaxes } = await import("./invoice-data");
    const lineTaxes = [101, 77, 3, 999, 1];
    const total = lineTaxes.reduce((a, b) => a + b, 0); // 1181
    const cgst = Math.floor(total / 2);
    const split = splitLineTaxes(lineTaxes, { cgst, sgst: total - cgst, igst: 0 });
    expect(split.cgst.reduce((a, b) => a + b, 0)).toBe(cgst);
    expect(split.sgst.reduce((a, b) => a + b, 0)).toBe(total - cgst);
    lineTaxes.forEach((t, i) => expect(split.cgst[i] + split.sgst[i]).toBe(t));
    split.cgst.forEach((c, i) => expect(Math.abs(c - split.sgst[i])).toBeLessThanOrEqual(1));
  });
});
