import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { PendingRefresher, RetryPayment } from "@/components/checkout/order-status-actions";
import { CatalogImage } from "@/components/store/catalog-image";
import { ButtonLink } from "@/components/ui/button";
import { Notice, Skeleton } from "@/components/ui/display";
import { findOrderForCustomer } from "@/lib/checkout/service";
import { getDb } from "@/lib/db/client";
import type { AddressSnapshot } from "@/lib/db/schema";
import { stateName } from "@/lib/domain/india";
import { orderStatusLabel, type OrderStatus } from "@/lib/domain/order-status";
import { formatMoney } from "@/lib/utils/money";

export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
};

function Address({ title, address }: { title: string; address: AddressSnapshot }) {
  return (
    <div>
      <h3 className="type-overline text-stone mb-2">{title}</h3>
      <p className="type-small leading-relaxed">
        {address.fullName}
        <br />
        {address.line1}
        {address.line2 && (
          <>
            <br />
            {address.line2}
          </>
        )}
        <br />
        {address.city}, {stateName(address.stateCode) ?? address.stateCode} {address.pincode}
        <br />
        {address.phone}
      </p>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? "type-price flex justify-between text-base" : "type-small flex justify-between"}>
      <dt className={strong ? "" : "text-stone"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

const headline: Partial<Record<OrderStatus, { title: string; body: ReactNode }>> = {
  paid: {
    title: "Thank you — your order is confirmed",
    body: "We've emailed you a confirmation. We'll write again when it ships.",
  },
  confirmed_cod: {
    title: "Thank you — your order is placed",
    body: "Please keep the amount ready for the courier. We've emailed you a confirmation.",
  },
  pending_payment: {
    title: "Confirming your payment…",
    body: "This usually takes a few seconds. Please don't pay again.",
  },
  payment_failed: {
    title: "The payment didn't go through",
    body: "Nothing has been charged. You can try again below.",
  },
  expired: {
    title: "This order wasn't paid in time",
    body: "Nothing has been charged. You can try again if the pieces are still available.",
  },
  refund_pending: {
    title: "We're sorry — this piece sold before your payment completed",
    body: "Your payment will be refunded in full. We'll email you once the refund is on its way.",
  },
  cancelled: { title: "This order was cancelled", body: "Nothing has been charged." },
};

async function OrderView({ params, searchParams }: PageProps<"/order/[ref]">) {
  const [{ ref }, query] = await Promise.all([params, searchParams]);
  const token = Array.isArray(query.t) ? query.t[0] : query.t;
  const found = token ? await findOrderForCustomer(getDb(), ref, token) : null;
  if (!found) notFound();
  const { order, items } = found;
  const message = headline[order.status] ?? { title: orderStatusLabel[order.status], body: null };
  const retryable =
    order.paymentMethod === "razorpay" && (order.status === "payment_failed" || order.status === "expired");

  return (
    <div className="grid gap-12 lg:grid-cols-12 lg:gap-x-16">
      <div className="lg:col-span-7">
        <p className="type-overline text-stone">Order {order.publicRef}</p>
        <h1 className="type-h2 mt-4">{message.title}</h1>
        {message.body && <p className="type-body text-stone mt-4 max-w-xl">{message.body}</p>}
        {order.status === "pending_payment" && <PendingRefresher />}
        {retryable && token && <RetryPayment orderRef={order.publicRef} accessToken={token} />}
        {order.isTest && (
          <Notice tone="info" className="mt-6">
            Test order — no real payment was taken.
          </Notice>
        )}

        <div className="border-line mt-12 grid gap-8 border-t pt-8 sm:grid-cols-2">
          <Address title="Delivering to" address={order.shippingAddress} />
          <div>
            <h3 className="type-overline text-stone mb-2">Contact</h3>
            <p className="type-small">{order.email}</p>
            {order.invoiceNumber && (
              <>
                <h3 className="type-overline text-stone mt-6 mb-2">Invoice</h3>
                <p className="type-small">{order.invoiceNumber}</p>
                {token && (
                  <a
                    href={`/api/orders/${order.publicRef}/invoice?t=${encodeURIComponent(token)}`}
                    className="type-small mt-2 inline-block underline underline-offset-4"
                  >
                    Download GST invoice (PDF)
                  </a>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-12 flex flex-wrap gap-4">
          <ButtonLink href="/shop" variant="secondary">
            Continue browsing
          </ButtonLink>
        </div>
      </div>

      <aside aria-label="Order details" className="lg:col-span-5">
        <div className="bg-soft-white p-6 sm:p-8">
          <ul className="space-y-4">
            {items.map((item) => (
              <li key={item.id} className="flex gap-4">
                <div className="w-16 shrink-0">
                  <CatalogImage src={item.image} alt="" sizes="4rem" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="type-small">{item.productName}</p>
                  <p className="type-caption text-stone">
                    {item.variantName ? `${item.variantName} · ` : ""}Qty {item.quantity}
                  </p>
                </div>
                <p className="type-small tabular-nums">{formatMoney(item.unitPrice * item.quantity)}</p>
              </li>
            ))}
          </ul>
          <dl className="border-line mt-6 space-y-2 border-t pt-5">
            <Row label="Subtotal" value={formatMoney(order.subtotal)} />
            {order.discountTotal > 0 && (
              <Row
                label={`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`}
                value={`− ${formatMoney(order.discountTotal)}`}
              />
            )}
            {order.giftWrapTotal > 0 && <Row label="Gift wrap" value={formatMoney(order.giftWrapTotal)} />}
            <Row label="Shipping" value={order.shippingTotal ? formatMoney(order.shippingTotal) : "Free"} />
            {order.codFee > 0 && <Row label="Cash on delivery fee" value={formatMoney(order.codFee)} />}
            <div className="border-line border-t pt-3">
              <Row
                label={order.paymentMethod === "cod" ? "To pay on delivery" : "Total"}
                value={formatMoney(order.total)}
                strong
              />
            </div>
            <p className="type-caption text-stone pt-1">
              Includes GST of {formatMoney(order.taxTotal)}
              {order.igst
                ? ` (IGST ${formatMoney(order.igst)})`
                : ` (CGST ${formatMoney(order.cgst)} · SGST ${formatMoney(order.sgst)})`}
            </p>
          </dl>
        </div>
      </aside>
    </div>
  );
}

export default function OrderPage(props: PageProps<"/order/[ref]">) {
  return (
    <div className="container-page pb-section-md pt-12">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <OrderView {...props} />
      </Suspense>
    </div>
  );
}
