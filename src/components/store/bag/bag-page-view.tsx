"use client";

import { BagLines, BagLoading, BagNotices, BagSummary, EmptyBag } from "./bag-contents";
import { useBag } from "./bag-provider";

/** Full-page bag: lines on the left, summary on the right (stacked on mobile). */
export function BagPageView({ checkoutEnabled }: { checkoutEnabled: boolean }) {
  const { bag, ready } = useBag();
  if (!ready) return <BagLoading />;
  if (bag.lines.length === 0) return <EmptyBag />;
  return (
    <div className="grid gap-12 lg:grid-cols-12 lg:gap-x-16">
      <div className="space-y-8 lg:col-span-7">
        <BagNotices bag={bag} />
        <BagLines />
      </div>
      <aside aria-label="Order summary" className="lg:col-span-5">
        <div className="bg-soft-white p-6 sm:p-8 lg:sticky lg:top-[calc(var(--header-height)+2rem)]">
          <h2 className="type-h4 mb-6">Summary</h2>
          <BagSummary checkoutEnabled={checkoutEnabled} />
        </div>
      </aside>
    </div>
  );
}
