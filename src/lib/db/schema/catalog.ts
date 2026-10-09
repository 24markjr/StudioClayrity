import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, tsvector, updatedAt } from "./columns";
import { imageKind, publishStatus, slugEntity, uniquenessType } from "./enums";

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    image: text("image"),
    position: integer("position").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("categories_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`)],
);

export const collections = pgTable(
  "collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    /** Editorial introduction (Markdown) */
    intro: text("intro"),
    bannerImage: text("banner_image"),
    position: integer("position").notNull().default(0),
    status: publishStatus("status").notNull().default("draft"),
    isFeatured: boolean("is_featured").notNull().default(false),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("collections_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    index("collections_status_idx").on(t.status),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    shortDescription: text("short_description"),
    /** Markdown */
    description: text("description"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    material: text("material"),
    finish: text("finish"),
    colour: text("colour"),
    careInstructions: text("care_instructions"),
    /** Note shown on one-of-a-kind / natural material pieces */
    variationNote: text("variation_note"),
    countryOfOrigin: text("country_of_origin"),
    hsnCode: text("hsn_code"),
    /** GST rate in basis points (1800 = 18%). Supplied by the owner's CA. */
    gstRateBp: integer("gst_rate_bp"),
    uniquenessType: uniquenessType("uniqueness_type").notNull().default("stock"),
    leadTimeDays: integer("lead_time_days"),
    isFeatured: boolean("is_featured").notNull().default(false),
    isGiftable: boolean("is_giftable").notNull().default(false),
    status: publishStatus("status").notNull().default("draft"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    isSample: boolean("is_sample").notNull().default(false),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL => sql`
        setweight(to_tsvector('english'::regconfig, coalesce(${products.name}, '')), 'A') ||
        setweight(to_tsvector('english'::regconfig, coalesce(${products.material}, '') || ' ' || coalesce(${products.finish}, '') || ' ' || coalesce(${products.colour}, '')), 'B') ||
        setweight(to_tsvector('english'::regconfig, coalesce(${products.shortDescription}, '')), 'B') ||
        setweight(to_tsvector('english'::regconfig, coalesce(${products.description}, '')), 'C')`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("products_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("products_gst_rate_range", sql`${t.gstRateBp} IS NULL OR ${t.gstRateBp} BETWEEN 0 AND 2800`),
    check(
      "products_lead_time_made_to_order",
      sql`${t.uniquenessType} <> 'made_to_order' OR ${t.leadTimeDays} IS NOT NULL`,
    ),
    check("products_lead_time_positive", sql`${t.leadTimeDays} IS NULL OR ${t.leadTimeDays} > 0`),
    index("products_status_idx").on(t.status),
    index("products_category_idx").on(t.categoryId),
    index("products_featured_idx")
      .on(t.isFeatured)
      .where(sql`${t.isFeatured}`),
    index("products_search_idx").using("gin", t.searchVector),
    index("products_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text("sku").notNull().unique(),
    /** e.g. "Large", "Honed" — null for the only variant of a simple product */
    name: text("name"),
    /** e.g. { "Size": "Large", "Finish": "Honed" } */
    options: jsonb("options").$type<Record<string, string>>().notNull().default({}),
    /** Selling price in paise, GST inclusive */
    price: integer("price").notNull(),
    compareAtPrice: integer("compare_at_price"),
    weightG: integer("weight_g"),
    lengthMm: integer("length_mm"),
    widthMm: integer("width_mm"),
    heightMm: integer("height_mm"),
    packedWeightG: integer("packed_weight_g"),
    packedLengthMm: integer("packed_length_mm"),
    packedWidthMm: integer("packed_width_mm"),
    packedHeightMm: integer("packed_height_mm"),
    /** Made-to-order pieces are not limited by stock on hand */
    trackInventory: boolean("track_inventory").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("variants_price_positive", sql`${t.price} > 0`),
    check("variants_compare_at_higher", sql`${t.compareAtPrice} IS NULL OR ${t.compareAtPrice} > ${t.price}`),
    index("variants_product_idx").on(t.productId),
    uniqueIndex("variants_one_default_idx")
      .on(t.productId)
      .where(sql`${t.isDefault}`),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    /** `cld:<public id>`, an absolute URL, or `placeholder:<tone>` in sample data */
    src: text("src").notNull(),
    alt: text("alt").notNull(),
    kind: imageKind("kind").notNull().default("angle"),
    width: integer("width"),
    height: integer("height"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    check("images_alt_present", sql`length(trim(${t.alt})) > 0`),
    index("images_product_idx").on(t.productId, t.position),
  ],
);

export const collectionProducts = pgTable(
  "collection_products",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.productId] }),
    index("collection_products_product_idx").on(t.productId),
  ],
);

/** "Complete the setting" recommendations, curated in the admin. */
export const productRelations = pgTable(
  "product_relations",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    relatedProductId: uuid("related_product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.relatedProductId] }),
    check("relations_not_self", sql`${t.productId} <> ${t.relatedProductId}`),
  ],
);

/** Old slugs keep working after a rename (301 to the new slug). */
export const slugRedirects = pgTable(
  "slug_redirects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entity: slugEntity("entity").notNull(),
    fromSlug: text("from_slug").notNull(),
    toSlug: text("to_slug").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("slug_redirects_from_idx").on(t.entity, t.fromSlug)],
);
