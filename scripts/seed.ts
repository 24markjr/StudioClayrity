/**
 * Seeds sample catalogue data for development and staging.
 *   pnpm db:seed           insert/refresh sample data
 *   pnpm db:seed --remove  delete all sample data
 *
 * Refuses to run when APP_ENV=production or when the database already holds real
 * (non-test) orders.
 */
import { eq, inArray } from "drizzle-orm";
import { createDb, type Database } from "../src/lib/db/create";
import {
  categories,
  collectionProducts,
  collections,
  coupons,
  inventory,
  inventoryAdjustments,
  orders,
  pages,
  productImages,
  products,
  productVariants,
  profiles,
  storeSettings,
} from "../src/lib/db/schema";
import { settingDefaults, type SettingKey } from "../src/lib/domain/settings";
import { rupeesToPaise } from "../src/lib/utils/money";
import { loadLocalEnv } from "./load-env";
import { sampleCategories, sampleCollections, sampleCoupons, samplePages, sampleProducts } from "./seed-data";

/** Fixed id so tests and local tools can refer to the development admin. */
export const DEV_ADMIN_ID = "00000000-0000-4000-8000-000000000001";

export class SeedRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedRefusedError";
  }
}

export async function assertSeedAllowed(db: Database, appEnv: string | undefined) {
  if (appEnv === "production") throw new SeedRefusedError("Refusing to seed: APP_ENV is production.");
  const [real] = await db.select({ id: orders.id }).from(orders).where(eq(orders.isTest, false)).limit(1);
  if (real) throw new SeedRefusedError("Refusing to seed: this database contains real orders.");
}

export async function removeSampleData(db: Database) {
  await db.transaction(async (tx) => {
    // Variants, images, inventory and collection links cascade from products
    await tx.delete(products).where(eq(products.isSample, true));
    await tx.delete(collections).where(eq(collections.isSample, true));
    await tx.delete(categories).where(eq(categories.isSample, true));
    await tx.delete(coupons).where(
      inArray(
        coupons.code,
        sampleCoupons.map((c) => c.code),
      ),
    );
  });
}

export async function seed(db: Database, options: { appEnv?: string } = {}) {
  await assertSeedAllowed(db, options.appEnv);
  await removeSampleData(db);

  await db.transaction(async (tx) => {
    const categoryRows = await tx
      .insert(categories)
      .values(sampleCategories.map((c) => ({ ...c, isSample: true })))
      .returning({ id: categories.id, slug: categories.slug });
    const categoryId = new Map(categoryRows.map((c) => [c.slug, c.id]));

    const collectionRows = await tx
      .insert(collections)
      .values(
        sampleCollections.map((c, i) => ({
          slug: c.slug,
          name: c.name,
          intro: c.intro,
          isFeatured: c.featured,
          position: i,
          status: "published" as const,
          isSample: true,
        })),
      )
      .returning({ id: collections.id, slug: collections.slug });
    const collectionId = new Map(collectionRows.map((c) => [c.slug, c.id]));

    for (const [index, p] of sampleProducts.entries()) {
      const [product] = await tx
        .insert(products)
        .values({
          slug: p.slug,
          name: p.name,
          shortDescription: p.short,
          description: p.description,
          categoryId: categoryId.get(p.category),
          material: p.material,
          finish: p.finish,
          colour: p.colour,
          careInstructions:
            p.material === "Stoneware"
              ? "Wipe clean. Not suitable for the dishwasher."
              : "Wipe with a soft, damp cloth. Avoid acidic liquids and abrasive cleaners.",
          variationNote: "Natural material: veining and tone vary from piece to piece.",
          countryOfOrigin: "To be confirmed",
          // Placeholder rate for sample data only — real rates come from the owner's CA
          gstRateBp: 1800,
          uniquenessType: p.uniqueness,
          leadTimeDays: p.leadTimeDays,
          isFeatured: p.featured ?? false,
          isGiftable: p.giftable ?? false,
          status: "published",
          publishedAt: new Date(Date.now() - index * 86_400_000),
          isSample: true,
        })
        .returning({ id: products.id });

      const variantRows = await tx
        .insert(productVariants)
        .values(
          p.variants.map((v, i) => ({
            productId: product.id,
            sku: v.sku,
            name: v.name ?? null,
            options: v.options ?? {},
            price: rupeesToPaise(v.price),
            compareAtPrice: v.compareAt ? rupeesToPaise(v.compareAt) : null,
            lengthMm: v.dims[0],
            widthMm: v.dims[1],
            heightMm: v.dims[2],
            weightG: v.weightG,
            packedWeightG: Math.round(v.weightG * 1.4),
            trackInventory: p.uniqueness !== "made_to_order",
            isDefault: i === 0,
            position: i,
          })),
        )
        .returning({ id: productVariants.id, sku: productVariants.sku });

      for (const row of variantRows) {
        const stock = p.variants.find((v) => v.sku === row.sku)!.stock;
        await tx
          .insert(inventory)
          .values({ variantId: row.id, onHand: stock, lowStockThreshold: p.uniqueness === "unique" ? 1 : 2 });
        if (stock > 0) {
          await tx.insert(inventoryAdjustments).values({
            variantId: row.id,
            delta: stock,
            onHandAfter: stock,
            reason: "initial",
            reference: "seed",
          });
        }
      }

      await tx.insert(productImages).values(
        (["hero", "angle", "detail", "scale"] as const).map((kind, i) => ({
          productId: product.id,
          src: `placeholder:${p.tones[i % 2]}`,
          alt: `${p.name} — ${kind} view (placeholder image)`,
          kind,
          width: 1600,
          height: 2000,
          position: i,
        })),
      );

      await tx.insert(collectionProducts).values(
        p.collections.map((slug, i) => ({
          collectionId: collectionId.get(slug)!,
          productId: product.id,
          position: index * 10 + i,
        })),
      );
    }

    await tx.insert(coupons).values(sampleCoupons.map((c) => ({ ...c })));

    await tx
      .insert(profiles)
      .values({
        id: DEV_ADMIN_ID,
        email: "admin@studioclayrity.local",
        fullName: "Development Admin",
        role: "admin",
      })
      .onConflictDoNothing();
  });

  // Draft pages: created once, never overwritten (the owner edits them in the admin)
  await db
    .insert(pages)
    .values(samplePages.map((p) => ({ ...p, status: "published" as const, isApproved: false })))
    .onConflictDoNothing();

  // Store settings: create defaults where missing, never overwrite edited values
  await db
    .insert(storeSettings)
    .values(
      (Object.keys(settingDefaults) as SettingKey[]).map((key) => ({ key, value: settingDefaults[key] })),
    )
    .onConflictDoNothing();

  return {
    categories: sampleCategories.length,
    collections: sampleCollections.length,
    products: sampleProducts.length,
  };
}

async function main() {
  loadLocalEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, sql } = createDb(url, { max: 1 });
  try {
    if (process.argv.includes("--remove")) {
      await assertSeedAllowed(db, process.env.APP_ENV);
      await removeSampleData(db);
      console.log("Sample data removed.");
    } else {
      const counts = await seed(db, { appEnv: process.env.APP_ENV });
      console.log(
        `Seeded ${counts.products} sample products, ${counts.collections} collections, ${counts.categories} categories.`,
      );
    }
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/seed.ts")) {
  main().catch((error) => {
    console.error(error instanceof SeedRefusedError ? error.message : error);
    process.exit(1);
  });
}
