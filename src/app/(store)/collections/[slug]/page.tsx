import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { CatalogGridSkeleton } from "@/components/store/catalog-grid";
import { CatalogImage } from "@/components/store/catalog-image";
import { ListingView } from "@/components/store/listing-view";
import { PageHeader } from "@/components/store/page-header";
import { Skeleton } from "@/components/ui/display";
import { getCollection, getStaticSlugs, resolveRedirect } from "@/lib/catalog/data";
import { Markdown } from "@/lib/content/markdown";

export async function generateStaticParams() {
  const { collections } = await getStaticSlugs();
  return collections.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollection(slug);
  if (!collection) return {};
  return {
    title: collection.seoTitle ?? collection.name,
    description: collection.seoDescription ?? collection.intro?.split("\n")[0] ?? undefined,
    alternates: { canonical: `/collections/${collection.slug}` },
  };
}

async function CollectionContent({ params, searchParams }: PageProps<"/collections/[slug]">) {
  const { slug } = await params;
  const collection = await getCollection(slug);
  if (!collection) {
    const target = await resolveRedirect("collection", slug);
    if (target) permanentRedirect(`/collections/${target}`);
    notFound();
  }
  return (
    <>
      <PageHeader
        title={collection.name}
        intro={
          collection.intro ? (
            <Markdown source={collection.intro} className="[&>p:first-child]:mt-0" />
          ) : undefined
        }
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Collections", href: "/collections" },
          { label: collection.name },
        ]}
      />
      {collection.bannerImage && (
        <CatalogImage
          src={collection.bannerImage}
          alt={collection.name}
          ratio="21/9"
          sizes="100vw"
          priority
          className="mb-14"
        />
      )}
      <Suspense fallback={<CatalogGridSkeleton />}>
        <ListingView
          scope={{ collectionSlug: collection.slug }}
          basePath={`/collections/${collection.slug}`}
          searchParams={searchParams}
        />
      </Suspense>
    </>
  );
}

export default function CollectionPage(props: PageProps<"/collections/[slug]">) {
  return (
    <div className="container-wide pb-section-md">
      <Suspense
        fallback={
          <>
            <div className="pt-8 pb-10 lg:pt-12 lg:pb-14">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-6 h-14 w-72" />
            </div>
            <CatalogGridSkeleton />
          </>
        }
      >
        <CollectionContent {...props} />
      </Suspense>
    </div>
  );
}
