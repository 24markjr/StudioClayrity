"use client";

import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import type { CardProduct } from "@/lib/catalog/types";
import { CatalogGrid } from "../catalog-grid";
import { useWishlist } from "./wishlist-provider";

/** Saved products; items disappear as soon as they're un-saved on this page. */
export function WishlistGrid({ products, sampleLabels }: { products: CardProduct[]; sampleLabels: boolean }) {
  const wishlist = useWishlist();
  const visible = wishlist ? products.filter((p) => wishlist.ids.has(p.id)) : products;
  if (visible.length === 0) {
    return (
      <EmptyState
        title="Nothing saved yet"
        description="Tap the heart on any piece to keep it here. Your wishlist is saved in this browser."
        action={<ButtonLink href="/shop">Explore the collection</ButtonLink>}
      />
    );
  }
  return <CatalogGrid products={visible} sampleLabels={sampleLabels} />;
}
