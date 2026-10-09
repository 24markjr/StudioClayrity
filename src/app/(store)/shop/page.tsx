import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogGridSkeleton } from "@/components/store/catalog-grid";
import { ListingView } from "@/components/store/listing-view";
import { PageHeader } from "@/components/store/page-header";
import { getNavigation } from "@/lib/catalog/data";

export const metadata: Metadata = {
  title: "Shop all pieces",
  description: "Trays, bowls, vases and objects in marble, travertine and clay.",
  // Filtered and sorted views all point search engines at the main listing
  alternates: { canonical: "/shop" },
};

export default async function ShopPage(props: PageProps<"/shop">) {
  const nav = await getNavigation();
  return (
    <div className="container-wide pb-section-md">
      <PageHeader title="All pieces" crumbs={[{ label: "Home", href: "/" }, { label: "Shop" }]} />
      <Suspense fallback={<CatalogGridSkeleton />}>
        <ListingView
          scope={{}}
          basePath="/shop"
          searchParams={props.searchParams}
          categories={nav.categories}
        />
      </Suspense>
    </div>
  );
}
