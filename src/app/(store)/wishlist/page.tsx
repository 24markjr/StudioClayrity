import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { WishlistGrid } from "@/components/store/bag/wishlist-grid";
import { CatalogGridSkeleton } from "@/components/store/catalog-grid";
import { getWishlistProducts } from "@/lib/cart/actions";
import { features, showSampleLabels } from "@/lib/features";

export const metadata: Metadata = {
  title: "Wishlist",
  robots: { index: false, follow: false },
};

async function SavedPieces() {
  // Reads the wishlist cookie, so this streams in at request time
  const products = await getWishlistProducts();
  return <WishlistGrid products={products} sampleLabels={showSampleLabels()} />;
}

export default function WishlistPage() {
  if (!features.wishlist) notFound();
  return (
    <div className="container-wide pb-section-md pt-12">
      <h1 className="type-h1 mb-12">Wishlist</h1>
      <Suspense fallback={<CatalogGridSkeleton count={4} />}>
        <SavedPieces />
      </Suspense>
    </div>
  );
}
