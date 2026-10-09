import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { CatalogGridSkeleton } from "@/components/store/catalog-grid";
import { ListingView } from "@/components/store/listing-view";
import { PageHeader } from "@/components/store/page-header";
import { Skeleton } from "@/components/ui/display";
import { getCategory, getStaticSlugs, resolveRedirect } from "@/lib/catalog/data";

export async function generateStaticParams() {
  const { categories } = await getStaticSlugs();
  return categories.map((category) => ({ category }));
}

export async function generateMetadata({ params }: PageProps<"/shop/[category]">): Promise<Metadata> {
  const { category: slug } = await params;
  const category = await getCategory(slug);
  if (!category) return {};
  return {
    title: category.name,
    description: category.description ?? `${category.name} in marble, travertine and clay.`,
    alternates: { canonical: `/shop/${category.slug}` },
  };
}

async function CategoryContent({ params, searchParams }: PageProps<"/shop/[category]">) {
  const { category: slug } = await params;
  const category = await getCategory(slug);
  if (!category) {
    const target = await resolveRedirect("category", slug);
    if (target) permanentRedirect(`/shop/${target}`);
    notFound();
  }
  return (
    <>
      <PageHeader
        title={category.name}
        intro={category.description}
        crumbs={[{ label: "Home", href: "/" }, { label: "Shop", href: "/shop" }, { label: category.name }]}
      />
      <Suspense fallback={<CatalogGridSkeleton />}>
        <ListingView
          scope={{ categorySlug: category.slug }}
          basePath={`/shop/${category.slug}`}
          searchParams={searchParams}
        />
      </Suspense>
    </>
  );
}

export default function CategoryPage(props: PageProps<"/shop/[category]">) {
  return (
    <div className="container-wide pb-section-md">
      <Suspense
        fallback={
          <>
            <div className="pt-8 pb-10 lg:pt-12 lg:pb-14">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-6 h-14 w-64" />
            </div>
            <CatalogGridSkeleton />
          </>
        }
      >
        <CategoryContent {...props} />
      </Suspense>
    </div>
  );
}
