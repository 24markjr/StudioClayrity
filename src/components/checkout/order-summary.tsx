import { Notice } from "@/components/ui/display";
import type { Quote } from "@/lib/checkout/quote";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import { CatalogImage } from "../store/catalog-image";

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-4",
        strong ? "type-price text-base" : "type-small",
        muted && "text-stone",
      )}
    >
      <dt className={cn(!strong && "text-stone")}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/** Lines, totals and the GST breakdown, exactly as the server priced them. */
export function OrderSummary({ quote, paymentMethod }: { quote: Quote; paymentMethod: "razorpay" | "cod" }) {
  return (
    <div className="space-y-6">
      <ul className="space-y-4">
        {quote.lines.map((line) => (
          <li key={line.variantId} className="flex gap-4">
            <div className="relative w-16 shrink-0">
              <CatalogImage src={line.image?.src} alt="" sizes="4rem" />
              <span className="bg-charcoal text-ivory type-caption absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full text-[0.625rem]">
                {line.quantity}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="type-small">{line.name}</p>
              {line.variantName && <p className="type-caption text-stone">{line.variantName}</p>}
            </div>
            <p className="type-small tabular-nums">{formatMoney(line.unitPrice * line.quantity)}</p>
          </li>
        ))}
      </ul>

      {quote.notices.map((n, i) => (
        <Notice key={i} tone="warning">
          {n.message}
        </Notice>
      ))}
      {quote.couponMessage && (
        <Notice tone="warning">{quote.couponMessage} The discount has been removed.</Notice>
      )}

      <dl className="border-line space-y-2 border-t pt-5">
        <Row label="Subtotal" value={formatMoney(quote.subtotal)} />
        {quote.discountTotal > 0 && (
          <Row
            label={`Discount${quote.coupon ? ` (${quote.coupon.code})` : ""}`}
            value={`− ${formatMoney(quote.discountTotal)}`}
          />
        )}
        {quote.giftWrapTotal > 0 && <Row label="Gift wrap" value={formatMoney(quote.giftWrapTotal)} />}
        <Row label="Shipping" value={quote.shippingTotal === 0 ? "Free" : formatMoney(quote.shippingTotal)} />
        {paymentMethod === "cod" && quote.codFee > 0 && (
          <Row label="Cash on delivery fee" value={formatMoney(quote.codFee)} />
        )}
        <div className="border-line border-t pt-3">
          <Row label="Total" value={formatMoney(quote.total)} strong />
        </div>
        <div className="space-y-1 pt-1">
          <p className="type-caption text-stone">Includes GST of {formatMoney(quote.taxTotal)}</p>
          {quote.intraState ? (
            <p className="type-caption text-stone">
              CGST {formatMoney(quote.cgst)} · SGST {formatMoney(quote.sgst)}
            </p>
          ) : (
            <p className="type-caption text-stone">IGST {formatMoney(quote.igst)}</p>
          )}
        </div>
      </dl>
    </div>
  );
}
