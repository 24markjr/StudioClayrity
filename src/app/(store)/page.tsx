import type { Metadata } from "next";
import Link from "next/link";
import { MaskReveal, Reveal, StaggerText } from "@/components/motion/primitives";
import { CatalogGrid } from "@/components/store/catalog-grid";
import { CatalogImage } from "@/components/store/catalog-image";
import { NewsletterForm } from "@/components/store/forms";
import { JsonLd, siteUrl } from "@/components/store/json-ld";
import { ButtonLink } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/ui/icons";
import { TextLink } from "@/components/ui/text-link";
import {
  getCollections,
  getFeaturedProducts,
  getGiftableProducts,
  getProductsBySlugs,
  getStoreSetting,
} from "@/lib/catalog/data";
import { features } from "@/lib/features";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";

export const metadata: Metadata = {
  title: { absolute: "Studio Clayrity — Decor objects in natural stone" },
  description: "Decor pieces in marble, travertine and clay for considered interiors.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const [home, collections, featured, giftable, gifting, seller] = await Promise.all([
    getStoreSetting("homepage"),
    getCollections(true),
    getFeaturedProducts(4),
    getGiftableProducts(4),
    getStoreSetting("gifting"),
    getStoreSetting("seller"),
  ]);
  const hotspotProducts = await getProductsBySlugs(home.editorial.hotspots.map((h) => h.productSlug));
  const { hero } = home;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: seller.legalName,
          url: siteUrl("/"),
        }}
      />

      {/* 1. Hero */}
      <section className="container-wide pb-section-sm grid gap-8 pt-4 lg:grid-cols-12 lg:gap-x-8 lg:pt-8">
        <div className="order-2 flex flex-col justify-end lg:order-1 lg:col-span-5 lg:pb-12">
          {hero.eyebrow && (
            <Reveal delay={0.6}>
              <p className="type-overline text-stone">{hero.eyebrow}</p>
            </Reveal>
          )}
          <StaggerText as="h1" text={hero.headline} className="type-display mt-5 block" delay={0.2} />
          <Reveal delay={0.9}>
            {hero.body && <p className="type-body-lg text-stone mt-6 max-w-md">{hero.body}</p>}
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
              <ButtonLink href={hero.primary.href} size="lg">
                {hero.primary.label}
              </ButtonLink>
              {hero.secondary && (
                <ButtonLink href={hero.secondary.href} size="lg" variant="text">
                  {hero.secondary.label}
                </ButtonLink>
              )}
            </div>
          </Reveal>
        </div>
        <div className="order-1 grid grid-cols-6 gap-3 lg:order-2 lg:col-span-7 lg:gap-4">
          <MaskReveal className={cn("col-span-6", hero.detailImage && "md:col-span-4")} delay={0.1}>
            <CatalogImage
              src={hero.image}
              alt={hero.imageAlt}
              ratio="4/5"
              className="aspect-[4/3] sm:aspect-[4/5]"
              sizes="(min-width: 64rem) 40vw, 100vw"
              priority
              showPlaceholderLabel
            />
          </MaskReveal>
          {hero.detailImage && (
            <div className="col-span-2 hidden flex-col justify-end gap-4 md:flex">
              <MaskReveal delay={0.35}>
                <CatalogImage
                  src={hero.detailImage}
                  alt={hero.detailImageAlt}
                  ratio="3/4"
                  sizes="20vw"
                  showPlaceholderLabel
                />
              </MaskReveal>
              {hero.caption && <p className="type-caption text-stone">{hero.caption}</p>}
            </div>
          )}
        </div>
      </section>

      {/* 2. Featured collections */}
      {collections.length > 0 && (
        <section aria-labelledby="collections-title" className="container-wide py-section-sm">
          <div className="mb-10 flex items-end justify-between gap-6">
            <h2 id="collections-title" className="type-h2">
              Collections
            </h2>
            <TextLink href="/collections" className="type-label shrink-0">
              View all
            </TextLink>
          </div>
          <ul className="grid gap-x-4 gap-y-10 md:grid-cols-12 lg:gap-x-6">
            {collections.slice(0, 3).map((c, i) => (
              <li
                key={c.slug}
                className={cn(
                  i === 0 ? "md:col-span-7" : "md:col-span-5",
                  i === 1 && "md:mt-24",
                  i === 2 && "md:col-span-5 md:col-start-4",
                )}
              >
                <Reveal delay={i * 0.08}>
                  <Link href={`/collections/${c.slug}`} className="group block">
                    <div className="overflow-hidden">
                      <div className="ease-out-quint transition-transform duration-700 group-hover:scale-[1.03]">
                        <CatalogImage
                          src={c.cover}
                          alt={c.name}
                          ratio={i === 0 ? "4/5" : "3/4"}
                          sizes="(min-width: 48rem) 50vw, 100vw"
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex items-baseline justify-between gap-4">
                      <h3 className="type-h3">{c.name}</h3>
                      <span className="type-caption text-stone">
                        {c.productCount} {c.productCount === 1 ? "piece" : "pieces"}
                      </span>
                    </div>
                    {c.intro && <p className="type-small text-stone mt-2 max-w-md">{c.intro}</p>}
                  </Link>
                </Reveal>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 3. Curated pieces */}
      {featured.length > 0 && (
        <section aria-labelledby="curated-title" className="container-wide py-section-sm">
          <div className="mb-10 flex items-end justify-between gap-6">
            <h2 id="curated-title" className="type-h2">
              Curated pieces
            </h2>
            <TextLink href="/shop" className="type-label shrink-0">
              Shop all
            </TextLink>
          </div>
          <CatalogGrid products={featured} />
        </section>
      )}

      {/* 4. Philosophy */}
      <section aria-label={home.philosophy.eyebrow || "Philosophy"} className="surface-dark mt-section-sm">
        <div className="container-page py-section-md grid lg:grid-cols-12">
          <Reveal className="lg:col-span-8 lg:col-start-3">
            {home.philosophy.eyebrow && <p className="type-overline text-stone">{home.philosophy.eyebrow}</p>}
            <p className="type-h2 mt-6">{home.philosophy.statement}</p>
          </Reveal>
        </div>
      </section>

      {/* 5. Material & craft */}
      <section
        aria-labelledby="material-title"
        className="container-wide py-section-md grid items-center gap-10 lg:grid-cols-12 lg:gap-x-8"
      >
        <div className="lg:col-span-6">
          <MaskReveal trigger="inView">
            <CatalogImage
              src={home.material.image}
              alt={home.material.imageAlt}
              ratio="4/5"
              sizes="(min-width: 64rem) 45vw, 100vw"
              showPlaceholderLabel
            />
          </MaskReveal>
        </div>
        <div className="lg:col-span-5 lg:col-start-8">
          <h2 id="material-title" className="type-h2">
            {home.material.title}
          </h2>
          <dl className="mt-10 space-y-8">
            {home.material.notes.map((note, i) => (
              <Reveal key={note.title} delay={i * 0.08} className="border-taupe border-l pl-5">
                <dt className="type-overline text-stone">{note.title}</dt>
                <dd className="type-body mt-2">{note.body}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      {/* 6. Editorial: in the room */}
      <section aria-labelledby="editorial-title" className="container-wide py-section-sm">
        <h2 id="editorial-title" className="type-h2 mb-10">
          {home.editorial.title}
        </h2>
        <div className="relative">
          <CatalogImage
            src={home.editorial.image}
            alt={home.editorial.imageAlt}
            ratio="16/9"
            className="aspect-[4/5] sm:aspect-video"
            sizes="100vw"
            showPlaceholderLabel
          />
          {home.editorial.hotspots.map((spot) => {
            const product = hotspotProducts.find((p) => p.slug === spot.productSlug);
            if (!product) return null;
            return (
              <Link
                key={spot.productSlug}
                href={`/products/${product.slug}`}
                style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                className="group bg-ivory/90 absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 py-2 pr-4 pl-2 backdrop-blur-sm"
              >
                <span aria-hidden="true" className="bg-charcoal block size-2 rounded-full" />
                <span className="type-caption">
                  {product.name} · {formatMoney(product.price)}
                </span>
              </Link>
            );
          })}
        </div>
        <ButtonLink
          href="/collections"
          variant="text"
          className="mt-6"
          iconEnd={<ArrowRightIcon className="size-4" />}
        >
          Explore the collections
        </ButtonLink>
      </section>

      {/* 7. Gifting edit */}
      {giftable.length > 0 && (
        <section aria-labelledby="gifting-title" className="container-wide py-section-sm">
          <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="gifting-title" className="type-h2">
                The gifting edit
              </h2>
              {gifting.wrapEnabled && (
                <p className="type-small text-stone mt-3">Gift wrapping is available at checkout.</p>
              )}
            </div>
            <TextLink href="/collections/gifting" className="type-label shrink-0">
              Shop gifts
            </TextLink>
          </div>
          <CatalogGrid products={giftable} />
        </section>
      )}

      {/* 8. Bespoke (enabled with the enquiry forms, Phase 10) */}
      {features.enquiries && (
        <section aria-labelledby="bespoke-title" className="container-page py-section-sm text-center">
          <h2 id="bespoke-title" className="type-h2">
            Commission a piece
          </h2>
          <ButtonLink href="/bespoke" variant="secondary" className="mt-8">
            Start an enquiry
          </ButtonLink>
        </section>
      )}

      {/* 9. Newsletter */}
      <section aria-labelledby="newsletter-title" className="bg-limestone/50 mt-section-sm">
        <div className="container-page py-section-sm grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 id="newsletter-title" className="type-h2">
              {home.newsletter.title}
            </h2>
            <p className="type-body text-stone mt-4">{home.newsletter.body}</p>
          </div>
          <NewsletterForm source="homepage" className="lg:col-span-6 lg:col-start-7 lg:self-end" />
        </div>
      </section>
    </>
  );
}
