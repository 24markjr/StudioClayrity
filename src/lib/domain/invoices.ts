import { sql } from "drizzle-orm";
import type { Executor } from "../db/create";
import { invoiceSequences } from "../db/schema";
import { financialYear, formatInvoiceNumber } from "./identifiers";

/**
 * Next GST invoice number for the financial year of `date`. A single atomic upsert, so
 * concurrent payments get consecutive numbers with no gaps or duplicates. Call it inside
 * the same transaction that marks the order paid, so a rollback doesn't burn a number.
 */
export async function nextInvoiceNumber(tx: Executor, date = new Date()) {
  const fy = financialYear(date);
  const [row] = await tx
    .insert(invoiceSequences)
    .values({ financialYear: fy, lastNumber: 1 })
    .onConflictDoUpdate({
      target: invoiceSequences.financialYear,
      set: { lastNumber: sql`${invoiceSequences.lastNumber} + 1` },
    })
    .returning({ lastNumber: invoiceSequences.lastNumber });
  return formatInvoiceNumber(fy, row.lastNumber);
}
