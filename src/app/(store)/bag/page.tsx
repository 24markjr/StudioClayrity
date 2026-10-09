import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BagPageView } from "@/components/store/bag/bag-page-view";
import { CatalogGrid } from "@/components/store/catalog-grid";
import { getFeaturedProducts } from "@/lib/catalog/data";
import { features } from "@/lib/features";

export const metadata: Metadata = {
  title: "Your bag",
  robots: { index: false, follow: false },
};

export default async function BagPage() {
  if (!features.bag) notFound();
  const suggestions = await getFeaturedProducts(4);
  return (
    <div className="container-wide pb-section-md pt-12">
      <h1 className="type-h1 mb-12">Your bag</h1>
      <BagPageView checkoutEnabled={features.checkout} />
      {suggestions.length > 0 && (
        <section
          aria-labelledby="suggestions-title"
          className="border-line mt-section-sm pt-section-sm border-t"
        >
          <h2 id="suggestions-title" className="type-h3 mb-8">
            You may also like
          </h2>
          <CatalogGrid products={suggestions} />
        </section>
      )}
    </div>
  );
}
