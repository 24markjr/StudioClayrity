import { PlaceholderImage, type PlaceholderTone } from "@/components/ui/placeholder-image";
import { ResponsiveImage, type AspectRatio } from "@/components/ui/responsive-image";
import { cn } from "@/lib/utils/cn";

const tones = new Set<PlaceholderTone>([
  "white-marble",
  "green-marble",
  "travertine",
  "charcoal-stone",
  "clay",
]);

/**
 * Renders an image reference from the database or settings:
 *   placeholder:<tone>  generated stone texture (sample data only, always labelled)
 *   cld:<public id>     Cloudinary
 *   /path or https://   regular image
 * A missing image shows a quiet "Image coming soon" frame instead of breaking the layout.
 */
export function CatalogImage({
  src,
  alt,
  ratio = "4/5",
  sizes,
  priority,
  className,
  showPlaceholderLabel = false,
  placeholderLabel,
}: {
  src: string | null | undefined;
  alt: string;
  ratio?: AspectRatio;
  sizes: string;
  priority?: boolean;
  className?: string;
  /** Label generated textures (true for large images; cards rely on the "Sample" badge) */
  showPlaceholderLabel?: boolean;
  placeholderLabel?: string;
}) {
  if (src?.startsWith("placeholder:")) {
    const tone = src.slice("placeholder:".length) as PlaceholderTone;
    return (
      <PlaceholderImage
        tone={tones.has(tone) ? tone : "white-marble"}
        ratio={ratio}
        className={className}
        showLabel={showPlaceholderLabel}
        label={placeholderLabel ?? alt.replace(/^Placeholder:\s*/i, "")}
      />
    );
  }
  if (!src) {
    return (
      <div
        role="img"
        aria-label={`${alt} (image coming soon)`}
        className={cn("bg-limestone flex items-end p-3", ratioClass[ratio], className)}
      >
        <span className="type-caption text-stone">Image coming soon</span>
      </div>
    );
  }
  return (
    <ResponsiveImage
      src={src}
      alt={alt}
      ratio={ratio}
      sizes={sizes}
      priority={priority}
      className={className}
    />
  );
}

const ratioClass: Record<AspectRatio, string> = {
  "4/5": "aspect-[4/5]",
  "3/4": "aspect-[3/4]",
  "1/1": "aspect-square",
  "3/2": "aspect-[3/2]",
  "16/9": "aspect-video",
  "21/9": "aspect-[21/9]",
};
