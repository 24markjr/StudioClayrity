import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { seed } from "../../scripts/seed";
import { parseListingParams } from "../../src/lib/catalog/filters";
import * as repo from "../../src/lib/catalog/repository";
import { statusLabel } from "../../src/lib/catalog/types";
import { inventory, products, productVariants, slugRedirects } from "../../src/lib/db/schema";
import { openTestDb } from "./helpers";

const { db } = openTestDb();
const all = (params: Record<string, string> = {}) => parseListingParams(params);

beforeAll(async () => {
  await seed(db, { appEnv: "test" });
  // Reset stock touched by other suites
  await db.update(inventory).set({ reserved: 0 });
});

describe("listProducts", () => {
  it("lists all published products with lowest price and images", async () => {
    const result = await repo.listProducts(db, {}, all());
    expect(result.total).toBe(12);
    expect(result.items).toHaveLength(12);
    const tray = result.items.find((p) => p.slug === "travertine-tray")!;
    expect(tray.price).toBe(550_000);
    expect(tray.compareAt).toBe(650_000);
    expect(tray.priceVaries).toBe(true);
    expect(tray.images).toHaveLength(2);
    expect(tray.images[0].kind).toBe("hero");
  });

  it("hides unpublished products", async () => {
    await db.update(products).set({ status: "draft" }).where(eq(products.slug, "coaster-set"));
    const result = await repo.listProducts(db, {}, all());
    expect(result.items.map((p) => p.slug)).not.toContain("coaster-set");
    expect(await repo.getProductBySlug(db, "coaster-set")).toBeNull();
    await db.update(products).set({ status: "published" }).where(eq(products.slug, "coaster-set"));
  });

  it("filters by category, collection, material, type, price and stock", async () => {
    const slugs = async (scope: repo.ListingScope, params: Record<string, string>) =>
      (await repo.listProducts(db, scope, all(params))).items.map((p) => p.slug).sort();

    expect(await slugs({ categorySlug: "vases" }, {})).toEqual([
      "monolith-vase",
      "ridge-vessel",
      "verde-sculptural-vase",
    ]);
    expect(await slugs({}, { category: "bowls" })).toEqual(["nero-marble-bowl", "pedestal-bowl"]);
    expect(await slugs({ collectionSlug: "gifting" }, { material: "Travertine" })).toEqual([
      "travertine-tray",
    ]);
    expect(await slugs({}, { type: "made_to_order" })).toEqual(["plinth-riser", "verde-sculptural-vase"]);
    expect(await slugs({}, { min: "20000" })).toEqual(["verde-sculptural-vase"]);
    expect(await slugs({ categorySlug: "objects" }, { stock: "1" })).toEqual([
      "arc-candle-holder",
      "coaster-set",
      "plinth-riser",
    ]);
  });

  it("sorts by price both ways", async () => {
    const asc = (await repo.listProducts(db, {}, all({ sort: "price_asc" }))).items.map((p) => p.price);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const desc = (await repo.listProducts(db, {}, all({ sort: "price_desc" }))).items.map((p) => p.price);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
  });

  it("puts sold-out pieces after available ones in the featured sort", async () => {
    const items = (await repo.listProducts(db, {}, all())).items;
    const firstSold = items.findIndex((p) => !p.available);
    expect(firstSold).toBeGreaterThan(0);
    expect(items.slice(firstSold).every((p) => !p.available)).toBe(true);
  });

  it("paginates and clamps an out-of-range page", async () => {
    const page2 = await repo.listProducts(db, {}, { ...all(), page: 2 });
    expect(page2.pageCount).toBe(1);
    expect(page2.page).toBe(1);
  });
});

describe("facets", () => {
  it("counts materials, types and stock within a scope", async () => {
    const facets = await repo.getFacets(db, { collectionSlug: "the-stone-edit" });
    expect(facets.total).toBe(5);
    expect(facets.materials).toEqual(
      expect.arrayContaining([
        { value: "Marble", count: 3 },
        { value: "Travertine", count: 1 },
      ]),
    );
    expect(facets.price).toEqual({ min: 680_000, max: 2_400_000 });
  });
});

describe("product detail", () => {
  it("returns variants with availability and images in display order", async () => {
    const p = (await repo.getProductBySlug(db, "travertine-tray"))!;
    expect(p.category).toEqual({ slug: "trays", name: "Trays" });
    expect(p.collections.map((c) => c.slug)).toEqual(expect.arrayContaining(["living-room", "gifting"]));
    expect(p.variants.map((v) => [v.sku, v.available])).toEqual([
      ["SAMPLE-TRAY-001-S", 6],
      ["SAMPLE-TRAY-001-L", 4],
    ]);
    expect(p.images.map((i) => i.kind)).toEqual(["hero", "angle", "detail", "scale"]);
  });

  it("reports made-to-order variants as not stock-limited", async () => {
    const p = (await repo.getProductBySlug(db, "verde-sculptural-vase"))!;
    expect(p.variants[0].available).toBeNull();
    expect(statusLabel({ uniqueness: p.uniqueness, leadTimeDays: p.leadTimeDays, available: true })).toBe(
      "Made to order · 3 weeks",
    );
  });

  it("excludes stock held for unpaid orders from availability", async () => {
    const [v] = await db.select().from(productVariants).where(eq(productVariants.sku, "SAMPLE-TRAY-001-L"));
    await db.update(inventory).set({ reserved: 3 }).where(eq(inventory.variantId, v.id));
    const p = (await repo.getProductBySlug(db, "travertine-tray"))!;
    expect(p.variants.find((x) => x.sku === "SAMPLE-TRAY-001-L")!.available).toBe(1);
    await db.update(inventory).set({ reserved: 0 }).where(eq(inventory.variantId, v.id));
  });

  it("follows slug redirects", async () => {
    await db
      .insert(slugRedirects)
      .values({ entity: "product", fromSlug: "old-tray", toSlug: "travertine-tray" })
      .onConflictDoNothing();
    expect(await repo.resolveRedirect(db, "product", "old-tray")).toBe("travertine-tray");
    expect(await repo.resolveRedirect(db, "product", "nope")).toBeNull();
  });
});

describe("related and curated", () => {
  it("prefers the same category and excludes the product itself", async () => {
    const p = (await repo.getProductBySlug(db, "nero-marble-bowl"))!;
    const related = await repo.getRelatedProducts(db, { id: p.id, categorySlug: "bowls" });
    expect(related[0].slug).toBe("pedestal-bowl");
    expect(related.map((r) => r.slug)).not.toContain("nero-marble-bowl");
  });

  it("returns featured and giftable products", async () => {
    expect((await repo.getFeaturedProducts(db)).map((p) => p.slug).sort()).toEqual(
      ["nero-marble-bowl", "slab-serving-board", "verde-sculptural-vase"].sort(),
    );
    expect((await repo.getGiftableProducts(db, 10)).every((p) => p.slug)).toBe(true);
  });

  it("lists collections with a cover image and product count", async () => {
    const cols = await repo.getCollections(db);
    expect(cols.map((c) => c.slug)).toEqual(["the-stone-edit", "gifting", "living-room"]);
    expect(cols.every((c) => c.cover?.startsWith("placeholder:"))).toBe(true);
    expect(cols[0].productCount).toBe(5);
  });

  it("builds navigation from categories that have products", async () => {
    const nav = await repo.getNavigation(db);
    expect(nav.categories.map((c) => c.slug)).toEqual(["trays", "bowls", "vases", "objects"]);
  });
});

describe("search", () => {
  it("matches names, materials and descriptions", async () => {
    expect((await repo.searchProducts(db, "travertine")).map((p) => p.slug)).toEqual(
      expect.arrayContaining(["travertine-tray", "monolith-vase", "plinth-riser"]),
    );
    expect((await repo.searchProducts(db, "candle")).map((p) => p.slug)).toContain("arc-candle-holder");
  });

  it("tolerates typos and matches category names", async () => {
    expect((await repo.searchProducts(db, "travertin tray"))[0].slug).toBe("travertine-tray");
    expect((await repo.searchProducts(db, "bookend")).map((p) => p.slug)).toContain("bianco-bookends");
    expect((await repo.searchProducts(db, "vases")).map((p) => p.slug)).toEqual(
      expect.arrayContaining(["monolith-vase", "ridge-vessel"]),
    );
  });

  it("ignores very short queries and is safe with special characters", async () => {
    expect(await repo.searchProducts(db, "a")).toEqual([]);
    await expect(repo.searchProducts(db, `%_' or 1=1 --`)).resolves.toBeDefined();
  });
});

describe("pages", () => {
  it("serves published draft pages", async () => {
    const about = await repo.getPublishedPage(db, "about");
    expect(about?.isApproved).toBe(false);
    expect((await repo.getPublishedPageLinks(db)).map((p) => p.slug)).toContain("returns");
  });
});
