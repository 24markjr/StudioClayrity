"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";
import { cloudinaryUrl, isCloudinarySrc } from "@/lib/images/cloudinary";
import { cn } from "@/lib/utils/cn";

export type AspectRatio = "4/5" | "3/4" | "1/1" | "3/2" | "16/9" | "21/9";

const aspectClass: Record<AspectRatio, string> = {
  "4/5": "aspect-[4/5]",
  "3/4": "aspect-[3/4]",
  "1/1": "aspect-square",
  "3/2": "aspect-[3/2]",
  "16/9": "aspect-video",
  "21/9": "aspect-[21/9]",
};

/**
 * Image in a fixed-ratio frame (no layout shift). The frame shows a limestone fill while
 * loading and fades the image in. Cloudinary sources (`cld:...`) are resized by Cloudinary.
 *
 * `sizes` is required: it tells the browser which width to download at each breakpoint,
 * e.g. product grid: "(min-width: 64rem) 25vw, (min-width: 48rem) 33vw, 50vw".
 */
export function ResponsiveImage({
  src,
  alt,
  ratio = "4/5",
  sizes,
  priority = false,
  fit = "cover",
  className,
  imageClassName,
  ...props
}: Omit<ImageProps, "src" | "fill" | "width" | "height" | "loader" | "sizes"> & {
  src: string;
  alt: string;
  ratio?: AspectRatio;
  sizes: string;
  fit?: "cover" | "contain";
  className?: string;
  imageClassName?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={cn("bg-limestone relative overflow-hidden", aspectClass[ratio], className)}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        loader={
          isCloudinarySrc(src)
            ? ({ src: s, width, quality }) => cloudinaryUrl({ src: s, width, quality })
            : undefined
        }
        onLoad={() => setLoaded(true)}
        className={cn(
          "ease-out-soft transition-opacity duration-600",
          fit === "cover" ? "object-cover" : "object-contain",
          loaded || priority ? "opacity-100" : "opacity-0",
          imageClassName,
        )}
        {...props}
      />
    </div>
  );
}
