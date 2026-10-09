import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { seed, SeedRefusedError } from "../../scripts/seed";
import { runMigrations } from "../../src/lib/db/migrate";
import {
  categories,
  coupons,
  inventory,
  orders,
  productImages,
  products,
  productVariants,
} from "../../src/lib/db/schema";
import { getSetting, setSetting } from "../../src/lib/domain/settings";
import { expectPgError, openTestDb } from "./helpers";

const { db } = openTestDb();

beforeAll(async () => {
  await seed(db, { appEnv: "test" });
});

describe("migrations", () => {
  it("are idempotent", async () => {
    await expect(runMigrations(process.env.TEST_DATABASE_URL!)).resolves.toBeUndefined();
  });

  it("enable row level security on every table", async () => {
    const rows = await db.execute<{ tablename: string; rowsecurity: boolean }>(
      sql`select tablename, rowsecurity from pg_tables where schemaname = 'public'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(38);
    expect(rows.filter((r) => !r.rowsecurity).map((r) => r.tablename)).toEqual([]);
  });
});

describe("seed", () => {
  it("is repeatable without duplicating data", async () => {
    await seed(db, { appEnv: "test" });
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(products);
    expect(count).toBe(12);
  });

  it("flags everything as sample data", async () => {
    const [{ real }] = await db
      .select({ real: sql<number>`count(*)::int` })
      .from(products)
      .where(eq(products.isSample, false));
    expect(real).toBe(0);
  });

  it("refuses to run in production", async () => {
    await expect(seed(db, { appEnv: "production" })).rejects.toBeInstanceOf(SeedRefusedError);
  });
});

describe("constraints", () => {
  async function anyVariant() {
    const [v] = await db.select().from(productVariants).limit(1);
    return v;
  }

  it("rejects duplicate SKUs", async () => {
    const v = await anyVariant();
    await expectPgError(
      db.insert(productVariants).values({ productId: v.productId, sku: v.sku, price: 1000 }),
      "23505",
    );
  });

  it("rejects malformed slugs", async () => {
    await expectPgError(db.insert(categories).values({ name: "Bad", slug: "Bad Slug" }), "23514");
  });

  it("rejects non-positive prices and compare-at prices below the price", async () => {
    const v = await anyVariant();
    await expectPgError(
      db.insert(productVariants).values({ productId: v.productId, sku: "X-ZERO", price: 0 }),
      "23514",
    );
    await expectPgError(
      db
        .insert(productVariants)
        .values({ productId: v.productId, sku: "X-CMP", price: 1000, compareAtPrice: 900 }),
      "23514",
    );
  });

  it("makes negative stock and over-reservation impossible", async () => {
    const v = await anyVariant();
    await expectPgError(
      db.update(inventory).set({ onHand: -1 }).where(eq(inventory.variantId, v.id)),
      "23514",
    );
    await expectPgError(
      db
        .update(inventory)
        .set({ reserved: sql`${inventory.onHand} + 1` })
        .where(eq(inventory.variantId, v.id)),
      "23514",
    );
  });

  it("requires image alt text", async () => {
    const [p] = await db.select().from(products).limit(1);
    await expectPgError(db.insert(productImages).values({ productId: p.id, src: "x", alt: "  " }), "23514");
  });

  it("requires a lead time for made-to-order products", async () => {
    await expectPgError(
      db.insert(products).values({ name: "MTO", slug: "mto-no-lead", uniquenessType: "made_to_order" }),
      "23514",
    );
  });

  it("keeps coupon codes upper-case and percentages within 100%", async () => {
    await expectPgError(db.insert(coupons).values({ code: "lower", type: "fixed", value: 100 }), "23514");
    await expectPgError(db.insert(coupons).values({ code: "BIG", type: "percent", value: 10_001 }), "23514");
  });

  it("enforces order arithmetic", async () => {
    const address = {
      fullName: "T",
      phone: "9876543210",
      line1: "1",
      city: "B",
      stateCode: "29",
      pincode: "560001",
      country: "IN",
    };
    const base = {
      publicRef: "SC-TEST01",
      accessTokenHash: "x",
      email: "t@example.com",
      phone: "9876543210",
      sellerStateCode: "29",
      shippingAddress: address,
      billingAddress: address,
      isTest: true,
    };
    // total ≠ subtotal − discount + shipping
    await expectPgError(db.insert(orders).values({ ...base, subtotal: 1000, total: 900 }), "23514");
    // tax parts must add up
    await expectPgError(
      db.insert(orders).values({ ...base, subtotal: 1000, total: 1000, taxTotal: 100, cgst: 40, sgst: 40 }),
      "23514",
    );
    // CGST/SGST and IGST are exclusive
    await expectPgError(
      db
        .insert(orders)
        .values({ ...base, subtotal: 1000, total: 1000, taxTotal: 100, cgst: 25, sgst: 25, igst: 50 }),
      "23514",
    );
  });
});

describe("search", () => {
  it("finds products by material and finish through the generated search vector", async () => {
    const rows = await db
      .select({ slug: products.slug })
      .from(products)
      .where(sql`${products.searchVector} @@ websearch_to_tsquery('english', 'honed travertine')`);
    expect(rows.map((r) => r.slug)).toContain("travertine-tray");
  });

  it("tolerates typos with trigram similarity", async () => {
    const rows = await db
      .select({ slug: products.slug })
      .from(products)
      .where(sql`similarity(${products.name}, 'travertin tray') > 0.3`);
    expect(rows.map((r) => r.slug)).toContain("travertine-tray");
  });
});

describe("store settings", () => {
  it("returns defaults and validates writes", async () => {
    expect((await getSetting(db, "checkout")).reservationMinutes).toBe(15);
    await setSetting(db, "cod", { enabled: true, maxOrderTotal: 2_000_000, fee: 5_000 });
    expect(await getSetting(db, "cod")).toEqual({ enabled: true, maxOrderTotal: 2_000_000, fee: 5_000 });
    await expect(setSetting(db, "cod", { enabled: true, maxOrderTotal: -1, fee: 0 })).rejects.toThrow();
  });
});
