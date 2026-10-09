import { findOrderForCustomer } from "@/lib/checkout/service";
import { getDb } from "@/lib/db/client";
import { invoicePdfForOrder } from "@/lib/documents/order-documents";

/**
 * GST invoice PDF for a customer, using the private link token from their order page.
 * Same answer for a wrong reference or a wrong token, so neither can be probed.
 */
export async function GET(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const db = getDb();
  const found = await findOrderForCustomer(db, ref, token);
  const pdf = found ? await invoicePdfForOrder(db, found.order.id) : null;
  if (!pdf) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
