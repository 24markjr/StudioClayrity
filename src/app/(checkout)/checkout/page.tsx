import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Notice, Skeleton } from "@/components/ui/display";
import { getCheckoutQuote } from "@/lib/checkout/actions";
import { getDb } from "@/lib/db/client";
import { getSetting } from "@/lib/domain/settings";
import { features } from "@/lib/features";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

async function Checkout() {
  // Reads the bag cookie, so it renders at request time
  const seller = await getSetting(getDb(), "seller");
  const { readiness, quote } = await getCheckoutQuote({ stateCode: seller.stateCode });

  if (!quote || quote.lines.length === 0) {
    return (
      <EmptyState
        title="Your bag is empty"
        description="Add a piece to your bag to check out."
        action={<ButtonLink href="/shop">Explore the collection</ButtonLink>}
      />
    );
  }

  if (!readiness.ready) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <Notice tone="info" title="Checkout isn't open yet">
          {readiness.reason} Your bag is saved.
        </Notice>
        <ButtonLink href="/bag" variant="secondary" className="mt-8">
          Back to bag
        </ButtonLink>
      </div>
    );
  }

  return (
    <CheckoutForm
      initialQuote={quote}
      paymentMethods={readiness.paymentMethods}
      defaultStateCode={seller.stateCode}
    />
  );
}

export default function CheckoutPage() {
  if (!features.checkout) notFound();
  return (
    <div className="container-page pb-section-sm pt-10">
      <h1 className="type-h1 mb-10">Checkout</h1>
      <Suspense
        fallback={
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-7">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
            <Skeleton className="h-96 lg:col-span-5" />
          </div>
        }
      >
        <Checkout />
      </Suspense>
    </div>
  );
}
