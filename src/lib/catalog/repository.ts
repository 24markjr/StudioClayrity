import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Executor } from "../db/create";
import {
  categories,
  collectionProducts,
  collections,
  inventory,
  pages,
  productImages,
  productRelations,
  products,
  productVariants,
  slugRedirects,
} from "../db/schema";
import { PAGE_SIZE, type ListingFilters } from "./filters";
import type { CardProduct, Facets, ImageRef, ListingResult, ProductDetail, Uniqueness } from "./types";

/**
 * Catalogue reads. Plain functions over a database handle so they're integration-tested
 * directly; src/lib/catalog/data.ts wraps them with caching for the pages.
 * Only published products are ever returned.
 */

const published = eq(products.status, "published");

/** Per-product price and availability across active variants. */
function variantSummary(db: Executor) {
  return db
    .select({
      productId: productVariants.productId,
      minPrice: sql<number>`min(${productVariants.price})`.as("min_price"),
      maxPrice: sql<number>`max(${productVariants.price})`.as("max_price"),
      // compare-at price of the cheapest variant
      compareAt: sql<
        number | null
      >`(array_agg(${productVariants.compareAtPrice} order by ${productVariants.price}, ${productVariants.position}))[1]`.as(
        "compare_at",
      ),
      available:
        sql<boolean>`bool_or(not ${productVariants.trackInventory} or coalesce(${inventory.onHand} - ${inventory.reserved}, 0) > 0)`.as(
          "available",
        ),
    })
    .from(productVariants)
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(eq(productVariants.isActive, true))
    .groupBy(productVariants.productId)
    .as("vs");
}

/** First images per product (hero first), keyed by product id. */
async function imagesFor(db: Executor, productIds: string[], perProduct = 2) {
  const map = new Map<string, ImageRef[]>();
  if (productIds.length === 0) return map;
  const rows = await db
    .select({
      productId: productImages.productId,
      src: productImages.src,
      alt: productImages.alt,
      kind: productImages.kind,
    })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(
      asc(productImages.productId),
      sql`${productImages.kind} = 'hero' desc`,
      asc(productImages.position),
    );
  for (const row of rows) {
    const list = map.get(row.productId) ?? [];
    if (list.length < perProduct) list.push({ src: row.src, alt: row.alt, kind: row.kind });
    map.set(row.productId, list);
  }
  return map;
}

type CardRow = {
  id: string;
  slug: string;
  name: string;
  uniqueness: Uniqueness;
  leadTimeDays: number | null;
  isSample: boolean;
  minPrice: number;
  maxPrice: number;
  compareAt: number | null;
  available: boolean;
};

const cardColumns = (vs: ReturnType<typeof variantSummary>) => ({
  id: products.id,
  slug: products.slug,
  name: products.name,
  uniqueness: products.uniquenessType,
  leadTimeDays: products.leadTimeDays,
  isSample: products.isSample,
  minPrice: vs.minPrice,
  maxPrice: vs.maxPrice,
  compareAt: vs.compareAt,
  available: vs.available,
});

async function toCards(db: Executor, rows: CardRow[]): Promise<CardProduct[]> {
  const images = await imagesFor(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    price: Number(r.minPrice),
    compareAt: r.compareAt === null ? null : Number(r.compareAt),
    priceVaries: Number(r.maxPrice) !== Number(r.minPrice),
    uniqueness: r.uniqueness,
    leadTimeDays: r.leadTimeDays,
    available: Boolean(r.available),
    isSample: r.isSample,
    images: images.get(r.id) ?? [],
  }));
}

export type ListingScope = { categorySlug?: string; collectionSlug?: string };

function scopeConditions(scope: ListingScope, filters?: Pick<ListingFilters, "category">): SQL[] {
  const conditions: SQL[] = [published];
  const categorySlug = scope.categorySlug ?? filters?.category ?? undefined;
  if (categorySlug) {
    conditions.push(
      inArray(
        products.categoryId,
        // categories is tiny; a subquery keeps the main query simple
        sql`(select ${categories.id} from ${categories} where ${categories.slug} = ${categorySlug} and ${categories.isActive})`,
      ),
    );
  }
  if (scope.collectionSlug) {
    conditions.push(
      sql`exists (select 1 from ${collectionProducts} cp join ${collections} c on c.id = cp.collection_id
        where cp.product_id = ${products.id} and c.slug = ${scope.collectionSlug} and c.status = 'published')`,
    );
  }
  return conditions;
}

export async function listProducts(
  db: Executor,
  scope: ListingScope,
  filters: ListingFilters,
): Promise<ListingResult> {
  const vs = variantSummary(db);
  const conditions = scopeConditions(scope, filters);
  if (filters.materials.length) conditions.push(inArray(products.material, filters.materials));
  if (filters.finishes.length) conditions.push(inArray(products.finish, filters.finishes));
  if (filters.types.length) conditions.push(inArray(products.uniquenessType, filters.types));
  if (filters.priceMin != null) conditions.push(gte(vs.minPrice, filters.priceMin * 100));
  if (filters.priceMax != null) conditions.push(lte(vs.minPrice, filters.priceMax * 100));
  if (filters.inStock) conditions.push(eq(vs.available, true));
  const where = and(...conditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(products)
    .innerJoin(vs, eq(vs.productId, products.id))
    .where(where);

  const collectionPosition = scope.collectionSlug
    ? sql`(select cp.position from ${collectionProducts} cp join ${collections} c on c.id = cp.collection_id
        where cp.product_id = ${products.id} and c.slug = ${scope.collectionSlug})`
    : null;

  const order: SQL[] =
    filters.sort === "price_asc"
      ? [asc(vs.minPrice)]
      : filters.sort === "price_desc"
        ? [desc(vs.minPrice)]
        : filters.sort === "newest"
          ? [sql`${products.publishedAt} desc nulls last`]
          : [
              // Featured: available first, then curated position / featured flag, then newest
              desc(vs.available),
              ...(collectionPosition
                ? [sql`${collectionPosition} asc nulls last`]
                : [desc(products.isFeatured)]),
              sql`${products.publishedAt} desc nulls last`,
            ];

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const rows = await db
    .select(cardColumns(vs))
    .from(products)
    .innerJoin(vs, eq(vs.productId, products.id))
    .where(where)
    .orderBy(...order, asc(products.name), asc(products.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  return { items: await toCards(db, rows), total, page, pageCount };
}

export async function getFacets(db: Executor, scope: ListingScope): Promise<Facets> {
  const vs = variantSummary(db);
  const where = and(...scopeConditions(scope));
  const [materials, finishes, types, [stats]] = await Promise.all([
    db
      .select({ value: products.material, count: count() })
      .from(products)
      .innerJoin(vs, eq(vs.productId, products.id))
      .where(and(where, isNotNull(products.material)))
      .groupBy(products.material)
      .orderBy(asc(products.material)),
    db
      .select({ value: products.finish, count: count() })
      .from(products)
      .innerJoin(vs, eq(vs.productId, products.id))
      .where(and(where, isNotNull(products.finish)))
      .groupBy(products.finish)
      .orderBy(asc(products.finish)),
    db
      .select({ value: products.uniquenessType, count: count() })
      .from(products)
      .innerJoin(vs, eq(vs.productId, products.id))
      .where(where)
      .groupBy(products.uniquenessType),
    db
      .select({
        min: sql<number | null>`min(${vs.minPrice})`,
        max: sql<number | null>`max(${vs.minPrice})`,
        inStock: sql<number>`count(*) filter (where ${vs.available})`.mapWith(Number),
        total: count(),
      })
      .from(products)
      .innerJoin(vs, eq(vs.productId, products.id))
      .where(where),
  ]);

  return {
    materials: materials.map((m) => ({ value: m.value!, count: m.count })),
    finishes: finishes.map((f) => ({ value: f.value!, count: f.count })),
    types: types.map((t) => ({ value: t.value, count: t.count })),
    price:
      stats.min === null || stats.max === null ? null : { min: Number(stats.min), max: Number(stats.max) },
    inStockCount: stats.inStock,
    total: stats.total,
  };
}

export async function getProductBySlug(db: Executor, slug: string): Promise<ProductDetail | null> {
  const [row] = await db
    .select({ product: products, category: { slug: categories.slug, name: categories.name } })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.slug, slug), published));
  if (!row) return null;
  const p = row.product;

  const [variantRows, imageRows, collectionRows] = await Promise.all([
    db
      .select({ variant: productVariants, onHand: inventory.onHand, reserved: inventory.reserved })
      .from(productVariants)
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(and(eq(productVariants.productId, p.id), eq(productVariants.isActive, true)))
      .orderBy(asc(productVariants.position), asc(productVariants.price)),
    db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, p.id))
      .orderBy(
        sql`array_position(array['hero','angle','detail','scale','lifestyle']::image_kind[], ${productImages.kind})`,
        asc(productImages.position),
      ),
    db
      .select({ slug: collections.slug, name: collections.name })
      .from(collectionProducts)
      .innerJoin(collections, eq(collections.id, collectionProducts.collectionId))
      .where(and(eq(collectionProducts.productId, p.id), eq(collections.status, "published")))
      .orderBy(asc(collections.position)),
  ]);

  if (variantRows.length === 0) return null;

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    shortDescription: p.shortDescription,
    description: p.description,
    material: p.material,
    finish: p.finish,
    colour: p.colour,
    careInstructions: p.careInstructions,
    variationNote: p.variationNote,
    countryOfOrigin: p.countryOfOrigin,
    uniqueness: p.uniquenessType,
    leadTimeDays: p.leadTimeDays,
    isSample: p.isSample,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    category: row.category?.slug ? { slug: row.category.slug, name: row.category.name } : null,
    collections: collectionRows,
    variants: variantRows.map(({ variant: v, onHand, reserved }) => ({
      id: v.id,
      sku: v.sku,
      name: v.name,
      options: v.options,
      price: v.price,
      compareAt: v.compareAtPrice,
      available: v.trackInventory ? Math.max(0, (onHand ?? 0) - (reserved ?? 0)) : null,
      isDefault: v.isDefault,
      dimensionsMm: { length: v.lengthMm, width: v.widthMm, height: v.heightMm },
      weightG: v.weightG,
    })),
    images: imageRows.map((i) => ({
      src: i.src,
      alt: i.alt,
      kind: i.kind,
      variantId: i.variantId,
      width: i.width,
      height: i.height,
    })),
  };
}

async function cardsWhere(db: Executor, where: SQL | undefined, order: SQL[], limit: number) {
  const vs = variantSummary(db);
  const rows = await db
    .select(cardColumns(vs))
    .from(products)
    .innerJoin(vs, eq(vs.productId, products.id))
    .where(where)
    .orderBy(...order, asc(products.id))
    .limit(limit);
  return toCards(db, rows);
}

export function getFeaturedProducts(db: Executor, limit = 8) {
  return cardsWhere(
    db,
    and(published, eq(products.isFeatured, true)),
    [sql`${products.publishedAt} desc nulls last`],
    limit,
  );
}

export function getGiftableProducts(db: Executor, limit = 4) {
  return cardsWhere(
    db,
    and(published, eq(products.isGiftable, true)),
    [sql`${products.publishedAt} desc nulls last`],
    limit,
  );
}

export function getProductsBySlugs(db: Executor, slugs: string[]) {
  if (slugs.length === 0) return Promise.resolve([]);
  return cardsWhere(db, and(published, inArray(products.slug, slugs)), [asc(products.name)], slugs.length);
}

/** Same category first, then anything else; available pieces first. */
export function getRelatedProducts(
  db: Executor,
  product: { id: string; categorySlug: string | null },
  limit = 4,
) {
  const sameCategory = product.categorySlug
    ? sql`${products.categoryId} = (select id from ${categories} where slug = ${product.categorySlug})`
    : sql`false`;
  return cardsWhere(
    db,
    and(published, sql`${products.id} <> ${product.id}`),
    [
      sql`${sameCategory} desc`,
      sql`${products.isFeatured} desc`,
      sql`${products.publishedAt} desc nulls last`,
    ],
    limit,
  );
}

/** "Complete the setting" — curated in the admin. */
export async function getComplementaryProducts(db: Executor, productId: string) {
  const rows = await db
    .select({ id: productRelations.relatedProductId })
    .from(productRelations)
    .where(eq(productRelations.productId, productId))
    .orderBy(asc(productRelations.position));
  if (rows.length === 0) return [];
  return cardsWhere(
    db,
    and(
      published,
      inArray(
        products.id,
        rows.map((r) => r.id),
      ),
    ),
    [asc(products.name)],
    4,
  );
}

export async function getNavigation(db: Executor) {
  const [cats, cols] = await Promise.all([
    db
      .select({ slug: categories.slug, name: categories.name })
      .from(categories)
      .where(
        and(
          eq(categories.isActive, true),
          sql`exists (select 1 from ${products} p where p.category_id = "categories"."id" and p.status = 'published')`,
        ),
      )
      .orderBy(asc(categories.position), asc(categories.name)),
    getCollections(db),
  ]);
  return { categories: cats, collections: cols };
}

export async function getCollections(db: Executor, options: { featuredOnly?: boolean } = {}) {
  // Cover: the banner if set, otherwise the hero image of the first product in the collection
  const cover = sql<string | null>`coalesce("collections"."banner_image", (
    select pi.src from ${collectionProducts} cp
    join ${products} p on p.id = cp.product_id and p.status = 'published'
    join ${productImages} pi on pi.product_id = p.id
    where cp.collection_id = "collections"."id"
    order by cp.position, (pi.kind = 'hero') desc, pi.position limit 1))`;
  const productCount =
    sql<number>`(select count(*) from ${collectionProducts} cp join ${products} p on p.id = cp.product_id
    where cp.collection_id = "collections"."id" and p.status = 'published')`.mapWith(Number);

  const rows = await db
    .select({
      slug: collections.slug,
      name: collections.name,
      intro: collections.intro,
      isFeatured: collections.isFeatured,
      cover,
      productCount,
    })
    .from(collections)
    .where(
      and(
        eq(collections.status, "published"),
        options.featuredOnly ? eq(collections.isFeatured, true) : undefined,
      ),
    )
    .orderBy(asc(collections.position), asc(collections.name));
  return rows.filter((c) => c.productCount > 0);
}

export async function getCollection(db: Executor, slug: string) {
  const [row] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.slug, slug), eq(collections.status, "published")));
  return row ?? null;
}

export async function getCategory(db: Executor, slug: string) {
  const [row] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.slug, slug), eq(categories.isActive, true)));
  return row ?? null;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Full-text search over name, material, finish and descriptions, plus trigram similarity
 * on the name (typos) and a match on category name.
 */
export async function searchProducts(db: Executor, rawQuery: string, limit = 24) {
  const q = rawQuery.trim().slice(0, 80);
  if (q.length < 2) return [];
  const vs = variantSummary(db);
  const tsQuery = sql`websearch_to_tsquery('english', ${q})`;
  const pattern = `%${escapeLike(q)}%`;
  const categoryMatch = sql`exists (select 1 from ${categories} c where c.id = ${products.categoryId} and c.name ilike ${pattern})`;
  const rows = await db
    .select(cardColumns(vs))
    .from(products)
    .innerJoin(vs, eq(vs.productId, products.id))
    .where(
      and(
        published,
        or(
          sql`${products.searchVector} @@ ${tsQuery}`,
          sql`similarity(${products.name}, ${q}) > 0.2`,
          ilike(products.name, pattern),
          categoryMatch,
        ),
      ),
    )
    .orderBy(
      sql`ts_rank(${products.searchVector}, ${tsQuery}) + similarity(${products.name}, ${q}) + (case when ${categoryMatch} then 0.1 else 0 end) desc`,
      asc(products.name),
    )
    .limit(limit);
  return toCards(db, rows);
}

export async function resolveRedirect(
  db: Executor,
  entity: "product" | "collection" | "category",
  slug: string,
) {
  const [row] = await db
    .select({ toSlug: slugRedirects.toSlug })
    .from(slugRedirects)
    .where(and(eq(slugRedirects.entity, entity), eq(slugRedirects.fromSlug, slug)));
  return row?.toSlug ?? null;
}

export async function getPublishedPage(db: Executor, slug: string) {
  const [row] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.slug, slug), eq(pages.status, "published")));
  return row ?? null;
}

export async function getPublishedPageLinks(db: Executor) {
  return db
    .select({ slug: pages.slug, title: pages.title })
    .from(pages)
    .where(eq(pages.status, "published"))
    .orderBy(asc(pages.title));
}

export async function getStaticSlugs(db: Executor) {
  const [p, c, k] = await Promise.all([
    db.select({ slug: products.slug }).from(products).where(published),
    db.select({ slug: collections.slug }).from(collections).where(eq(collections.status, "published")),
    db.select({ slug: categories.slug }).from(categories).where(eq(categories.isActive, true)),
  ]);
  return {
    products: p.map((r) => r.slug),
    collections: c.map((r) => r.slug),
    categories: k.map((r) => r.slug),
  };
}
