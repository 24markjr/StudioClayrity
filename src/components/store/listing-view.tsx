import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Pagination } from "@/components/ui/display";
import { getFacets, listProducts } from "@/lib/catalog/data";
import { activeFilterCount, PAGE_SIZE, parseListingParams, toQueryString } from "@/lib/catalog/filters";
import type { ListingScope } from "@/lib/catalog/repository";
import { CatalogGrid } from "./catalog-grid";
import { FilterSheetButton, FilterSidebar, SortSelect } from "./listing-controls";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Filterable, sortable product listing. Reads searchParams, so pages render it inside
 * <Suspense>; the data calls themselves are cached per filter combination.
 */
export async function ListingView({
  scope,
  basePath,
  searchParams,
  categories,
}: {
  scope: ListingScope;
  basePath: string;
  searchParams: SearchParams;
  categories?: Array<{ slug: string; name: string }>;
}) {
  const filters = parseListingParams(await searchParams);
  const [result, facets] = await Promise.all([listProducts(scope, filters), getFacets(scope)]);
  const filtered = activeFilterCount(filters) > 0;
  const from = result.total === 0 ? 0 : (result.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(result.page * PAGE_SIZE, result.total);
  const controls = { basePath, filters, facets, categories };

  return (
    <div className="grid gap-x-10 lg:grid-cols-[15rem_1fr]">
      <aside aria-label="Filters" className="hidden lg:block">
        <FilterSidebar {...controls} />
      </aside>

      <div>
        <div className="border-line mb-8 flex items-center justify-between gap-4 border-b pb-4">
          <p className="type-small text-stone whitespace-nowrap" role="status">
            {result.total === 0
              ? "No pieces"
              : result.pageCount > 1
                ? `Showing ${from}–${to} of ${result.total} pieces`
                : `${result.total} ${result.total === 1 ? "piece" : "pieces"}`}
          </p>
          <div className="flex items-center gap-3">
            <div className="lg:hidden">
              <FilterSheetButton {...controls} />
            </div>
            <SortSelect basePath={basePath} filters={filters} />
          </div>
        </div>

        {result.items.length === 0 ? (
          <EmptyState
            title={filtered ? "No pieces match these filters" : "Nothing here yet"}
            description={
              filtered
                ? "Try removing a filter or widening the price range."
                : "New pieces are added regularly."
            }
            action={
              filtered ? (
                <ButtonLink href={basePath} variant="secondary">
                  Clear filters
                </ButtonLink>
              ) : (
                <ButtonLink href="/shop" variant="secondary">
                  See all pieces
                </ButtonLink>
              )
            }
          />
        ) : (
          <CatalogGrid products={result.items} priorityCount={4} />
        )}

        <Pagination
          className="mt-16"
          current={result.page}
          total={result.pageCount}
          hrefFor={(page) => `${basePath}${toQueryString({ ...filters, page })}`}
        />
      </div>
    </div>
  );
}
