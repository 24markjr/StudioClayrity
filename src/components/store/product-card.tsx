import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Price } from "@/components/ui/display";
import { cn } from "@/lib/utils/cn";

/**
 * Product card — presentational only. Image slots accept any node so the card works with
 * real photography (<ResponsiveImage>) and with placeholders during development.
 * Hover: primary image eases up in scale and the second image (if any) cross-fades in.
 */
export function ProductCard({
  href,
  name,
  price,
  compareAt,
  pricePrefix,
  status,
  image,
  hoverImage,
  action,
  imageTag,
  className,
}: {
  href: string;
  name: string;
  /** Minor units (paise) */
  price: number;
  compareAt?: number | null;
  /** e.g. "From" when variants are priced differently */
  pricePrefix?: string;
  /** e.g. "One of a kind", "Made to order · 3 weeks", "Sold" */
  status?: string;
  image: ReactNode;
  hoverImage?: ReactNode;
  /** Small control in the image corner, e.g. a wishlist button (must be its own focusable element) */
  action?: ReactNode;
  /** Small label in the bottom corner of the image, e.g. "Sample" */
  imageTag?: ReactNode;
  className?: string;
}) {
  return (
    <article className={cn("group/card relative", className)}>
      <div className="relative overflow-hidden">
        <div className="ease-out-quint transition-transform duration-700 group-hover/card:scale-[1.03]">
          {image}
        </div>
        {hoverImage && (
          <div className="ease-out-soft absolute inset-0 opacity-0 transition-opacity duration-500 group-hover/card:opacity-100">
            {hoverImage}
          </div>
        )}
        {status && (
          <Badge
            tone={status.toLowerCase() === "sold" ? "dark" : "neutral"}
            className="absolute top-3 left-3 z-10 max-w-[calc(100%-1.5rem)] leading-snug whitespace-normal"
          >
            {status}
          </Badge>
        )}
        {action && <div className="absolute top-2 right-2 z-20">{action}</div>}
        {imageTag && <div className="absolute right-3 bottom-3 z-10">{imageTag}</div>}
      </div>
      <div className="mt-4 flex flex-col gap-1.5">
        <h3 className="type-card-title">
          {/* Stretched link: the whole card is clickable, the action button stays separate */}
          <Link
            href={href}
            className="ease-out-quint bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat transition-[background-size] duration-300 group-hover/card:bg-[length:100%_1px] after:absolute after:inset-0 after:z-10"
          >
            {name}
          </Link>
        </h3>
        <Price amount={price} compareAt={compareAt} prefix={pricePrefix} className="text-stone" />
      </div>
    </article>
  );
}
