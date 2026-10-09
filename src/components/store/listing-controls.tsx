"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { Checkbox, SelectField } from "@/components/ui/field";
import {
  activeFilterCount,
  SORT_OPTIONS,
  toggleValue,
  toQueryString,
  TYPE_OPTIONS,
  type ListingFilters,
  type SortValue,
} from "@/lib/catalog/filters";
import type { Facets } from "@/lib/catalog/types";
import { cn } from "@/lib/utils/cn";

type Props = {
  basePath: string;
  filters: ListingFilters;
  facets: Facets;
  /** Category filter (shown on /shop, where the category isn't fixed by the URL path) */
  categories?: Array<{ slug: string; name: string }>;
};

/**
 * Navigates to the filtered URL. Controls show the new state immediately (optimistic)
 * while the server renders the results, so a tick never lags behind the click.
 */
function useListingNavigation(basePath: string, filters: ListingFilters) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(filters);
  const go = (next: ListingFilters) =>
    startTransition(() => {
      setOptimistic(next);
      router.push(`${basePath}${toQueryString(next)}`, { scroll: false });
    });
  return { go, pending, filters: optimistic };
}

export function SortSelect(props: Pick<Props, "basePath" | "filters">) {
  const { go, pending, filters } = useListingNavigation(props.basePath, props.filters);
  return (
    <SelectField
      label="Sort by"
      hideLabel
      value={filters.sort}
      disabled={pending}
      onChange={(e) => go({ ...filters, sort: e.target.value as SortValue, page: 1 })}
      className="w-40 sm:w-48"
    >
      {SORT_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </SelectField>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-line border-t py-6">
      <legend className="type-overline text-stone float-left mb-4 w-full">{title}</legend>
      <div className="clear-both flex flex-col gap-3">{children}</div>
    </fieldset>
  );
}

function FilterFields({
  filters,
  facets,
  categories,
  onChange,
}: Omit<Props, "basePath"> & { onChange: (f: ListingFilters) => void }) {
  const [min, setMin] = useState(filters.priceMin?.toString() ?? "");
  const [max, setMax] = useState(filters.priceMax?.toString() ?? "");

  function applyPrice(e: FormEvent) {
    e.preventDefault();
    const toNumber = (v: string) => (/^\d{1,8}$/.test(v) ? Number(v) : null);
    onChange({ ...filters, priceMin: toNumber(min), priceMax: toNumber(max), page: 1 });
  }

  return (
    <div>
      {categories && categories.length > 0 && (
        <FilterGroup title="Object">
          {categories.map((c) => (
            <Checkbox
              key={c.slug}
              label={c.name}
              checked={filters.category === c.slug}
              onChange={() =>
                onChange({ ...filters, category: filters.category === c.slug ? null : c.slug, page: 1 })
              }
            />
          ))}
        </FilterGroup>
      )}

      <FilterGroup title="Availability">
        <Checkbox
          label={`Available now (${facets.inStockCount})`}
          checked={filters.inStock}
          onChange={() => onChange({ ...filters, inStock: !filters.inStock, page: 1 })}
        />
        {TYPE_OPTIONS.filter((t) => facets.types.some((f) => f.value === t.value)).map((t) => (
          <Checkbox
            key={t.value}
            label={`${t.label} (${facets.types.find((f) => f.value === t.value)?.count ?? 0})`}
            checked={filters.types.includes(t.value)}
            onChange={() => onChange(toggleValue(filters, "types", t.value))}
          />
        ))}
      </FilterGroup>

      {facets.materials.length > 1 && (
        <FilterGroup title="Material">
          {facets.materials.map((m) => (
            <Checkbox
              key={m.value}
              label={`${m.value} (${m.count})`}
              checked={filters.materials.includes(m.value)}
              onChange={() => onChange(toggleValue(filters, "materials", m.value))}
            />
          ))}
        </FilterGroup>
      )}

      {facets.finishes.length > 1 && (
        <FilterGroup title="Finish">
          {facets.finishes.map((f) => (
            <Checkbox
              key={f.value}
              label={`${f.value} (${f.count})`}
              checked={filters.finishes.includes(f.value)}
              onChange={() => onChange(toggleValue(filters, "finishes", f.value))}
            />
          ))}
        </FilterGroup>
      )}

      {facets.price && (
        <FilterGroup title="Price (₹)">
          <form onSubmit={applyPrice} className="flex items-end gap-2">
            <label className="flex-1">
              <span className="type-caption text-stone">Min</span>
              <input
                inputMode="numeric"
                value={min}
                onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))}
                placeholder={String(Math.floor(facets.price.min / 100))}
                className="border-line-strong bg-soft-white type-small focus-visible:outline-charcoal mt-1 h-10 w-full border px-3 focus-visible:outline-2"
              />
            </label>
            <label className="flex-1">
              <span className="type-caption text-stone">Max</span>
              <input
                inputMode="numeric"
                value={max}
                onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))}
                placeholder={String(Math.ceil(facets.price.max / 100))}
                className="border-line-strong bg-soft-white type-small focus-visible:outline-charcoal mt-1 h-10 w-full border px-3 focus-visible:outline-2"
              />
            </label>
            <Button type="submit" size="sm" variant="secondary">
              Apply
            </Button>
          </form>
        </FilterGroup>
      )}
    </div>
  );
}

/** Desktop: always-visible sidebar that applies each change immediately. */
export function FilterSidebar(props: Props) {
  const { go, pending, filters } = useListingNavigation(props.basePath, props.filters);
  const count = activeFilterCount(filters);
  return (
    <div className={cn("transition-opacity", pending && "opacity-60")} aria-busy={pending}>
      <div className="flex items-baseline justify-between pb-4">
        <h2 className="type-label">Filter</h2>
        {count > 0 && (
          <button
            type="button"
            onClick={() =>
              go({
                ...filters,
                materials: [],
                finishes: [],
                types: [],
                priceMin: null,
                priceMax: null,
                inStock: false,
                category: null,
                page: 1,
              })
            }
            className="type-caption text-stone hover:text-charcoal underline underline-offset-4"
          >
            Clear all
          </button>
        )}
      </div>
      {/* Keyed by the URL so the price inputs reset when filters change elsewhere */}
      <FilterFields key={toQueryString(props.filters)} {...props} filters={filters} onChange={go} />
    </div>
  );
}

/** Mobile: a bottom sheet; changes are collected and applied together. */
export function FilterSheetButton(props: Props) {
  const { go } = useListingNavigation(props.basePath, props.filters);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(props.filters);
  const count = activeFilterCount(props.filters);
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setDraft(props.filters);
          setOpen(true);
        }}
      >
        Filter{count > 0 ? ` (${count})` : ""}
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        side="bottom"
        title="Filter"
        footer={
          <div className="flex gap-3">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() =>
                setDraft({
                  ...draft,
                  materials: [],
                  finishes: [],
                  types: [],
                  priceMin: null,
                  priceMax: null,
                  inStock: false,
                  category: null,
                })
              }
            >
              Clear
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setOpen(false);
                go({ ...draft, page: 1 });
              }}
            >
              Show results
            </Button>
          </div>
        }
      >
        <FilterFields
          filters={draft}
          facets={props.facets}
          categories={props.categories}
          onChange={setDraft}
        />
      </Drawer>
    </>
  );
}
