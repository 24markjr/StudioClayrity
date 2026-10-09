"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FadeSwap } from "@/components/motion/primitives";
import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Badge, Notice, Price } from "@/components/ui/display";
import { ShareIcon, WhatsAppIcon } from "@/components/ui/icons";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { useToast } from "@/components/ui/toast";
import { Markdown } from "@/lib/content/markdown";
import { statusLabel, type ProductDetail, type VariantDetail } from "@/lib/catalog/types";
import { cn } from "@/lib/utils/cn";
import { BackInStockForm } from "../forms";
import { DimensionsDiagram } from "./dimensions-diagram";
import { ProductGallery } from "./product-gallery";
import {
  initialVariant,
  isAvailable,
  optionNames,
  optionValues,
  selectOption,
  valueAvailable,
} from "./variant-logic";

type Props = {
  product: ProductDetail;
  orderingEnabled: boolean;
  showSampleLabel: boolean;
  /** WhatsApp number (digits) when configured */
  whatsapp: string | null;
};

export function ProductView({ product, orderingEnabled, showSampleLabel, whatsapp }: Props) {
  const [variant, setVariant] = useState<VariantDetail>(() => initialVariant(product.variants));
  const [quantity, setQuantity] = useState(1);
  const names = optionNames(product.variants);
  const available = isAvailable(variant);
  const status = statusLabel({
    uniqueness: product.uniqueness,
    leadTimeDays: product.leadTimeDays,
    available,
  });
  const maxQuantity = product.uniqueness === "unique" ? 1 : Math.min(variant.available ?? 10, 10);

  // Variant-specific images first, then the shared ones
  const images = useMemo(() => {
    const specific = product.images.filter((i) => i.variantId === variant.id);
    const shared = product.images.filter((i) => !i.variantId);
    return specific.length ? [...specific, ...shared] : shared.length ? shared : product.images;
  }, [product.images, variant.id]);

  function choose(next: VariantDetail) {
    setVariant(next);
    setQuantity(1);
  }

  const whatsappHref = whatsapp
    ? `https://wa.me/91${whatsapp}?text=${encodeURIComponent(
        `Hello Studio Clayrity, I'm interested in ${product.name}${variant.name ? ` (${variant.name})` : ""}, SKU ${variant.sku}.`,
      )}`
    : null;

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-x-12">
      <div className="lg:col-span-7">
        {/* Remount on variant change so the gallery starts at the variant's first image */}
        <ProductGallery key={variant.id} images={images} productName={product.name} />
      </div>

      <div className="lg:col-span-5">
        <div className="lg:sticky lg:top-[calc(var(--header-height)+2rem)]">
          <div className="flex flex-wrap items-center gap-2">
            {status && <Badge tone={available ? "neutral" : "dark"}>{status}</Badge>}
            {product.isSample && showSampleLabel && <Badge tone="outline">Sample product</Badge>}
          </div>
          <h1 className="type-product-title mt-4">{product.name}</h1>

          <FadeSwap id={variant.id} className="mt-4">
            <Price amount={variant.price} compareAt={variant.compareAt} size="lg" />
            <p className="type-caption text-stone mt-1">Inclusive of all taxes</p>
          </FadeSwap>

          {product.shortDescription && (
            <p className="type-body text-stone mt-6">{product.shortDescription}</p>
          )}

          {/* Options */}
          {names.length > 0 && (
            <div className="mt-8 space-y-6">
              {names.map((name) => (
                <fieldset key={name}>
                  <legend className="type-label mb-3">
                    {name}: <span className="text-stone font-normal">{variant.options[name]}</span>
                  </legend>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={name}>
                    {optionValues(product.variants, name).map((value) => {
                      const selected = variant.options[name] === value;
                      const purchasable = valueAvailable(product.variants, variant, name, value);
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => choose(selectOption(product.variants, variant, name, value))}
                          className={cn(
                            "type-small min-h-11 min-w-16 border px-4 transition-colors duration-160",
                            selected
                              ? "border-charcoal bg-charcoal text-ivory"
                              : "border-line-strong hover:border-charcoal",
                            !purchasable && !selected && "text-stone decoration-stone line-through",
                          )}
                        >
                          {value}
                          {!purchasable && <span className="sr-only"> (unavailable)</span>}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          )}

          {/* Availability notes */}
          <div className="mt-8 space-y-3" aria-live="polite">
            {product.uniqueness === "unique" && available && (
              <Notice tone="info">
                This is a one-of-a-kind piece — the one pictured is the one you receive.
              </Notice>
            )}
            {product.uniqueness === "made_to_order" && (
              <Notice tone="info" title="Made to order">
                {product.leadTimeDays
                  ? `Made for you after you order. Ships in about ${Math.max(1, Math.round(product.leadTimeDays / 7))} weeks.`
                  : "Made for you after you order. We'll confirm the lead time."}
              </Notice>
            )}
            {product.uniqueness === "stock" &&
              available &&
              variant.available !== null &&
              variant.available <= 2 && (
                <p className="type-small text-warning">Only {variant.available} left</p>
              )}
          </div>

          {/* Purchase */}
          {available ? (
            <div className="mt-6 space-y-4">
              <div className="flex items-stretch gap-3">
                {maxQuantity > 1 && (
                  <QuantityStepper value={quantity} onChange={setQuantity} max={maxQuantity} />
                )}
                <Button size="lg" className="flex-1" disabled={!orderingEnabled}>
                  Add to bag
                </Button>
              </div>
              {!orderingEnabled && (
                <p className="type-small text-stone">
                  Online ordering opens soon.
                  {whatsappHref ? " In the meantime, ask us about this piece on WhatsApp." : ""}
                </p>
              )}
            </div>
          ) : (
            <div className="border-line mt-6 border-t pt-6">
              <p className="type-label mb-3">
                {product.uniqueness === "unique" ? "This piece has found a home." : "Currently sold out."}
              </p>
              <BackInStockForm variantId={variant.id} productName={product.name} />
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="type-small hover:text-earth inline-flex items-center gap-2 underline-offset-4 hover:underline"
              >
                <WhatsAppIcon className="size-4" /> Ask on WhatsApp
              </a>
            )}
            <ShareButton name={product.name} />
          </div>

          <p className="type-caption text-stone mt-6">SKU {variant.sku}</p>

          <ProductDetails product={product} variant={variant} />
        </div>
      </div>
    </div>
  );
}

function ShareButton({ name }: { name: string }) {
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={async () => {
        const url = window.location.href;
        try {
          if (navigator.share) {
            await navigator.share({ title: name, url });
            return;
          }
          await navigator.clipboard.writeText(url);
          toast({ tone: "success", title: "Link copied" });
        } catch (error) {
          if ((error as Error).name !== "AbortError")
            toast({ tone: "error", title: "Couldn't copy the link" });
        }
      }}
      className="type-small hover:text-earth inline-flex items-center gap-2 underline-offset-4 hover:underline"
    >
      <ShareIcon className="size-4" /> Share
    </button>
  );
}

function formatCm(mm: number | null) {
  return mm === null ? null : `${(mm / 10).toLocaleString("en-IN", { maximumFractionDigits: 1 })} cm`;
}

function ProductDetails({ product, variant }: { product: ProductDetail; variant: VariantDetail }) {
  const { length, width, height } = variant.dimensionsMm;
  const hasDims = length !== null || width !== null || height !== null;
  const materialRows = [
    ["Material", product.material],
    ["Finish", product.finish],
    ["Colour", product.colour],
    ["Country of origin", product.countryOfOrigin],
  ].filter((r): r is [string, string] => Boolean(r[1]));

  const items = [
    product.description && {
      id: "description",
      title: "Description",
      content: <Markdown source={product.description} className="[&>p:first-child]:mt-0" />,
    },
    (hasDims || variant.weightG) && {
      id: "dimensions",
      title: "Dimensions & weight",
      content: (
        <div className="space-y-4">
          {hasDims && <DimensionsDiagram lengthMm={length} widthMm={width} heightMm={height} />}
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
            {length !== null && (
              <>
                <dt>Length</dt>
                <dd className="text-charcoal">{formatCm(length)}</dd>
              </>
            )}
            {width !== null && (
              <>
                <dt>Width</dt>
                <dd className="text-charcoal">{formatCm(width)}</dd>
              </>
            )}
            {height !== null && (
              <>
                <dt>Height</dt>
                <dd className="text-charcoal">{formatCm(height)}</dd>
              </>
            )}
            {variant.weightG !== null && (
              <>
                <dt>Weight</dt>
                <dd className="text-charcoal">
                  {(variant.weightG / 1000).toLocaleString("en-IN", { maximumFractionDigits: 1 })} kg
                </dd>
              </>
            )}
          </dl>
        </div>
      ),
    },
    materialRows.length > 0 && {
      id: "material",
      title: "Material & finish",
      content: (
        <div className="space-y-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
            {materialRows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt>{label}</dt>
                <dd className="text-charcoal">{value}</dd>
              </div>
            ))}
          </dl>
          {product.variationNote && <p>{product.variationNote}</p>}
        </div>
      ),
    },
    product.careInstructions && { id: "care", title: "Care", content: <p>{product.careInstructions}</p> },
    {
      id: "delivery",
      title: "Shipping & returns",
      content: (
        <p>
          Read our{" "}
          <Link href="/policies/shipping" className="text-charcoal underline underline-offset-4">
            shipping policy
          </Link>{" "}
          and{" "}
          <Link href="/policies/returns" className="text-charcoal underline underline-offset-4">
            returns policy
          </Link>
          , including what to do if a piece arrives damaged.
        </p>
      ),
    },
  ].filter((item): item is { id: string; title: string; content: React.ReactElement } => Boolean(item));

  return <Accordion className="mt-10" items={items} defaultOpen={["description"]} />;
}
