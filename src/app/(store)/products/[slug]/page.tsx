import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { CatalogGrid } from "@/components/store/catalog-grid";
import { breadcrumbJsonLd, JsonLd, siteUrl } from "@/components/store/json-ld";
import { ProductView } from "@/components/store/pdp/product-view";
import { RecentlyViewed } from "@/components/store/pdp/recently-viewed";
import { Breadcrumbs, Skeleton } from "@/components/ui/display";
import {
  getComplementaryProducts,
  getProduct,
  getRelatedProducts,
  getStaticSlugs,
  getStoreSetting,
  resolveRedirect,
} from "@/lib/catalog/data";
import type { ProductDetail } from "@/lib/catalog/types";
import { normaliseIndianMobile } from "@/lib/domain/india";
import { features, showSampleLabels } from "@/lib/features";

export async function generateStaticParams() {
  const { products } = await getStaticSlugs();
  return products.map((slug) => ({ slug }));
}

/** Only real photographs go into metadata and structured data — never placeholders. */
function publicImageUrls(product: ProductDetail) {
  return product.images
    .map((i) => i.src)
    .filter((src) => !src.startsWith("placeholder:"))
    .map((src) =>
      src.startsWith("cld:")
        ? `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/f_auto,q_auto,w_1600/${src.slice(4)}`
        : src.startsWith("/")
          ? siteUrl(src)
          : src,
    );
}

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return {};
  const description = product.seoDescription ?? product.shortDescription ?? undefined;
  const images = publicImageUrls(product).slice(0, 1);
  return {
    title: product.seoTitle ?? product.name,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: { title: product.name, description, images, type: "website" },
  };
}

function productJsonLd(product: ProductDetail) {
  const url = siteUrl(`/products/${product.slug}`);
  const availability = (available: number | null) =>
    available === null
      ? "https://schema.org/MadeToOrder"
      : available > 0
        ? "https://schema.org/InStock"
        : product.uniqueness === "unique"
          ? "https://schema.org/SoldOut"
          : "https://schema.org/OutOfStock";
  const rupees = (paise: number) => (paise / 100).toFixed(2);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription ?? undefined,
    sku: product.variants[0].sku,
    image: publicImageUrls(product),
    material: product.material ?? undefined,
    brand: { "@type": "Brand", name: "Studio Clayrity" },
    offers: product.variants.map((v) => ({
      "@type": "Offer",
      sku: v.sku,
      name: v.name ?? undefined,
      price: rupees(v.price),
      priceCurrency: "INR",
      availability: availability(v.available),
      itemCondition: "https://schema.org/NewCondition",
      url,
    })),
  };
}

async function ProductContent({ params }: Pick<PageProps<"/products/[slug]">, "params">) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) {
    const target = await resolveRedirect("product", slug);
    if (target) permanentRedirect(`/products/${target}`);
    notFound();
  }

  const [contact, complementary, related] = await Promise.all([
    getStoreSetting("contact"),
    getComplementaryProducts(product.id),
    getRelatedProducts(product.id, product.category?.slug ?? null),
  ]);

  const crumbs = [
    { label: "Home", href: "/" },
    product.category
      ? { label: product.category.name, href: `/shop/${product.category.slug}` }
      : { label: "Shop", href: "/shop" },
    { label: product.name },
  ];
  const hero = product.images[0];

  return (
    <>
      <JsonLd data={productJsonLd(product)} />
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Breadcrumbs items={crumbs} className="pt-6 pb-6 lg:pt-8 lg:pb-8" />

      <ProductView
        product={product}
        orderingEnabled={features.ordering}
        showSampleLabel={showSampleLabels()}
        whatsapp={normaliseIndianMobile(contact.whatsapp)}
      />

      <div className="mt-section-md space-y-section-sm">
        {complementary.length > 0 && (
          <section aria-labelledby="complete-title">
            <h2 id="complete-title" className="type-h3 mb-8">
              Complete the setting
            </h2>
            <CatalogGrid products={complementary} />
          </section>
        )}
        {related.length > 0 && (
          <section aria-labelledby="related-title" className="border-line pt-section-sm border-t">
            <h2 id="related-title" className="type-h3 mb-8">
              You may also like
            </h2>
            <CatalogGrid products={related} />
          </section>
        )}
        <RecentlyViewed
          current={{
            slug: product.slug,
            name: product.name,
            image: hero?.src ?? null,
            alt: hero?.alt ?? product.name,
          }}
        />
      </div>
    </>
  );
}

function ProductSkeleton() {
  return (
    <div className="grid gap-10 pt-16 lg:grid-cols-12 lg:gap-x-12">
      <Skeleton className="aspect-[4/5] lg:col-span-7" />
      <div className="space-y-4 lg:col-span-5">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-8 h-14 w-full" />
      </div>
    </div>
  );
}

export default function ProductPage({ params }: PageProps<"/products/[slug]">) {
  return (
    <div className="container-wide pb-section-md">
      <Suspense fallback={<ProductSkeleton />}>
        <ProductContent params={params} />
      </Suspense>
    </div>
  );
}
