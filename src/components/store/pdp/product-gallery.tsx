"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { FadeSwap } from "@/components/motion/primitives";
import { ArrowLeftIcon, ArrowRightIcon, CloseIcon, ZoomIcon } from "@/components/ui/icons";
import type { ImageRef } from "@/lib/catalog/types";
import { cn } from "@/lib/utils/cn";
import { CatalogImage } from "../catalog-image";

const MAIN_SIZES = "(min-width: 64rem) 50vw, 100vw";

/**
 * Product gallery. Desktop: vertical thumbnails + main image. Mobile: swipeable strip with
 * position dots. Any image opens a full-screen lightbox (arrow keys, Escape, click to zoom).
 */
export function ProductGallery({ images, productName }: { images: ImageRef[]; productName: string }) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const index = Math.min(active, Math.max(0, images.length - 1));

  // Keep the mobile dots in sync with swiping
  function onStripScroll() {
    const strip = stripRef.current;
    if (!strip) return;
    const i = Math.round(strip.scrollLeft / strip.clientWidth);
    if (i !== index) setActive(i);
  }

  if (images.length === 0) {
    return <CatalogImage src={null} alt={productName} sizes={MAIN_SIZES} />;
  }

  return (
    <div>
      {/* Mobile strip */}
      <div className="lg:hidden">
        <div
          ref={stripRef}
          onScroll={onStripScroll}
          className="-mx-gutter flex snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto [&::-webkit-scrollbar]:hidden"
          aria-label={`${productName} images`}
          role="region"
        >
          {images.map((image, i) => (
            <button
              key={`${image.src}-${i}`}
              type="button"
              onClick={() => setLightbox(i)}
              aria-label={`View image ${i + 1} of ${images.length} full screen`}
              className="w-full shrink-0 snap-center"
            >
              <CatalogImage
                src={image.src}
                alt={image.alt}
                sizes="100vw"
                priority={i === 0}
                showPlaceholderLabel={i === 0}
              />
            </button>
          ))}
        </div>
        {images.length > 1 && (
          <div className="mt-4 flex justify-center gap-2" aria-hidden="true">
            {images.map((_, i) => (
              <span
                key={i}
                className={cn("h-px w-6 transition-colors", i === index ? "bg-charcoal" : "bg-line-strong")}
              />
            ))}
          </div>
        )}
      </div>

      {/* Desktop: thumbnails + main */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-[5rem_1fr]">
        <ul className="flex flex-col gap-3" aria-label="Choose an image">
          {images.map((image, i) => (
            <li key={`${image.src}-${i}`}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show image ${i + 1}: ${image.alt}`}
                aria-current={i === index}
                className={cn(
                  "block w-full outline-offset-2 transition-opacity duration-240",
                  i === index ? "ring-charcoal opacity-100 ring-1" : "opacity-60 hover:opacity-100",
                )}
              >
                <CatalogImage src={image.src} alt="" sizes="5rem" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setLightbox(index)}
          className="group relative block cursor-zoom-in"
          aria-label={`View ${images[index].alt} full screen`}
        >
          <FadeSwap id={index}>
            <CatalogImage
              src={images[index].src}
              alt={images[index].alt}
              sizes={MAIN_SIZES}
              priority
              showPlaceholderLabel
            />
          </FadeSwap>
          <span className="bg-ivory/80 absolute right-3 bottom-3 flex size-10 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <ZoomIcon className="size-4" />
          </span>
        </button>
      </div>

      <Lightbox images={images} index={lightbox} onChange={setLightbox} />
    </div>
  );
}

function Lightbox({
  images,
  index,
  onChange,
}: {
  images: ImageRef[];
  index: number | null;
  onChange: (i: number | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const open = index !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") onChange(((index ?? 0) + 1) % images.length);
      if (e.key === "ArrowLeft") onChange(((index ?? 0) - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, images.length, onChange]);

  function toggleZoom(e: ReactPointerEvent<HTMLButtonElement>) {
    if (zoom) return setZoom(null);
    const rect = e.currentTarget.getBoundingClientRect();
    setZoom({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }

  function pan(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!zoom || e.pointerType !== "mouse") return;
    const rect = e.currentTarget.getBoundingClientRect();
    setZoom({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }

  const current = index === null ? null : images[index];

  return (
    <dialog
      ref={ref}
      aria-label="Image viewer"
      onClose={() => {
        setZoom(null);
        onChange(null);
      }}
      className="sc-overlay sc-dialog bg-ivory m-0 h-dvh max-h-none w-screen max-w-none p-0"
    >
      {current && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-4 py-3 sm:px-6">
            <p className="type-caption text-stone" aria-live="polite">
              {index! + 1} / {images.length}
            </p>
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label="Close image viewer"
              className="flex size-11 items-center justify-center"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6 sm:px-16">
            <button
              type="button"
              onPointerUp={toggleZoom}
              onPointerMove={pan}
              aria-label={zoom ? "Zoom out" : "Zoom in"}
              className={cn(
                "relative h-full max-h-full overflow-hidden",
                zoom ? "cursor-zoom-out" : "cursor-zoom-in",
              )}
              style={{ aspectRatio: "4 / 5" }}
            >
              <div
                className="ease-out-quint h-full transition-transform duration-300"
                style={
                  zoom ? { transform: "scale(2.2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined
                }
              >
                <CatalogImage
                  src={current.src}
                  alt={current.alt}
                  sizes="100vw"
                  className="h-full"
                  showPlaceholderLabel
                />
              </div>
            </button>
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(null);
                    onChange((index! - 1 + images.length) % images.length);
                  }}
                  aria-label="Previous image"
                  className="bg-ivory/80 absolute top-1/2 left-2 flex size-11 -translate-y-1/2 items-center justify-center sm:left-4"
                >
                  <ArrowLeftIcon />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(null);
                    onChange((index! + 1) % images.length);
                  }}
                  aria-label="Next image"
                  className="bg-ivory/80 absolute top-1/2 right-2 flex size-11 -translate-y-1/2 items-center justify-center sm:right-4"
                >
                  <ArrowRightIcon />
                </button>
              </>
            )}
          </div>
          <p className="type-caption text-stone px-4 pb-4 text-center">{current.alt}</p>
        </div>
      )}
    </dialog>
  );
}
