import { Badge } from "@/components/ui/display";
import { Skeleton } from "@/components/ui/display";
import { statusLabel, type CardProduct } from "@/lib/catalog/types";
import { showSampleLabels } from "@/lib/features";
import { cn } from "@/lib/utils/cn";
import { CatalogImage } from "./catalog-image";
import { ProductCard } from "./product-card";

export const GRID_SIZES = "(min-width: 80rem) 22vw, (min-width: 64rem) 30vw, (min-width: 48rem) 33vw, 50vw";

export function CatalogCard({ product, priority }: { product: CardProduct; priority?: boolean }) {
  const [hero, hover] = product.images;
  const status = statusLabel(product);
  return (
    <div className="relative">
      <ProductCard
        href={`/products/${product.slug}`}
        name={product.name}
        price={product.price}
        compareAt={product.compareAt}
        pricePrefix={product.priceVaries ? "From" : undefined}
        status={status ?? undefined}
        image={
          <CatalogImage
            src={hero?.src}
            alt={hero?.alt ?? product.name}
            sizes={GRID_SIZES}
            priority={priority}
          />
        }
        hoverImage={hover ? <CatalogImage src={hover.src} alt="" sizes={GRID_SIZES} /> : undefined}
        imageTag={
          product.isSample && showSampleLabels() ? (
            <Badge tone="outline" className="bg-ivory/90">
              Sample
            </Badge>
          ) : undefined
        }
      />
    </div>
  );
}

export function CatalogGrid({
  products,
  className,
  priorityCount = 0,
}: {
  products: CardProduct[];
  className?: string;
  /** Load the first N images eagerly (above the fold) */
  priorityCount?: number;
}) {
  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:gap-x-6 lg:gap-y-14 xl:grid-cols-4",
        className,
      )}
    >
      {products.map((product, i) => (
        <li key={product.id}>
          <CatalogCard product={product} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}

export function CatalogGridSkeleton({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading products"
      className={cn("grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:gap-x-6 xl:grid-cols-4", className)}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Skeleton className="aspect-[4/5]" />
          <Skeleton className="mt-4 h-5 w-3/4" />
          <Skeleton className="mt-2 h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}
