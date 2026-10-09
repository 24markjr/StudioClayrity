import type { Metadata } from "next";
import { after } from "next/server";
import { Suspense } from "react";
import { CatalogGrid, CatalogGridSkeleton } from "@/components/store/catalog-grid";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { TextLink } from "@/components/ui/text-link";
import { getNavigation, searchProducts } from "@/lib/catalog/data";
import { getDb } from "@/lib/db/client";
import { searchQueries } from "@/lib/db/schema";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: true },
};

async function Results({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 80) ?? "";

  if (q.length < 2) {
    return (
      <EmptyState title="What are you looking for?" description="Search by object, material or finish." />
    );
  }

  const [results, nav] = await Promise.all([searchProducts(q), getNavigation()]);

  // Record the query anonymously after the response is sent (no user id, no IP)
  after(async () => {
    try {
      await getDb().insert(searchQueries).values({ query: q.toLowerCase(), resultCount: results.length });
    } catch {
      // analytics only — never affects the shopper
    }
  });

  return (
    <>
      <h1 className="type-h1">
        <span className="text-stone">Results for</span> &ldquo;{q}&rdquo;
      </h1>
      <p className="type-small text-stone mt-4 mb-10" role="status">
        {results.length} {results.length === 1 ? "piece" : "pieces"}
      </p>
      {results.length > 0 ? (
        <CatalogGrid products={results} priorityCount={4} />
      ) : (
        <div className="py-8">
          <p className="type-body text-stone">
            No pieces match. Try a material such as marble or travertine, or browse:
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
            {nav.categories.map((c) => (
              <li key={c.slug}>
                <TextLink href={`/shop/${c.slug}`} variant="persistent" className="type-body">
                  {c.name}
                </TextLink>
              </li>
            ))}
          </ul>
          <ButtonLink href="/shop" variant="secondary" className="mt-10">
            See all pieces
          </ButtonLink>
        </div>
      )}
    </>
  );
}

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="container-wide pb-section-md pt-12">
      <Suspense fallback={<CatalogGridSkeleton count={4} />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
