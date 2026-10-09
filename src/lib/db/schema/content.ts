import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { products, productVariants } from "./catalog";
import { createdAt, updatedAt } from "./columns";
import { profiles } from "./customers";
import { deliveryStatus, enquiryStatus, enquiryType, publishStatus, subscriberStatus } from "./enums";

/** Editable store content: announcement bar, homepage sections, footer, shipping rules… */
export const storeSettings = pgTable("store_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});

/** About, policies and other editable pages (Markdown). */
export const pages = pgTable("pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  status: publishStatus("status").notNull().default("draft"),
  /** Shown as "Pending owner approval" until the owner signs off */
  isApproved: boolean("is_approved").notNull().default(false),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Contact form, bespoke commissions, "request more photos", video viewings, trade. */
export const enquiries = pgTable(
  "enquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: enquiryType("type").notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    orderRef: text("order_ref"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    message: text("message").notNull(),
    attachments: jsonb("attachments").$type<string[]>().notNull().default([]),
    status: enquiryStatus("status").notNull().default("new"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("enquiries_status_idx").on(t.status, t.createdAt)],
);

export const backInStockRequests = pgTable(
  "back_in_stock_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    // One open request per email per variant
    uniqueIndex("back_in_stock_open_idx")
      .on(t.variantId, sql`lower(${t.email})`)
      .where(sql`${t.notifiedAt} IS NULL`),
  ],
);

export const newsletterSubscribers = pgTable(
  "newsletter_subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    status: subscriberStatus("status").notNull().default("pending"),
    source: text("source"),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    unsubscribeToken: text("unsubscribe_token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("newsletter_email_idx").on(sql`lower(${t.email})`)],
);

/**
 * Outgoing transactional email log. `dedupeKey` (e.g. "order:<id>:confirmation") makes
 * sending idempotent, so webhook retries never send the same email twice.
 */
export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    template: text("template").notNull(),
    /** Recipient is stored for support lookups; never logged to the console */
    recipient: text("recipient").notNull(),
    status: deliveryStatus("status").notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("email_deliveries_status_idx").on(t.status)],
);

/** Anonymous search log for the admin (no user ids, no IPs). */
export const searchQueries = pgTable(
  "search_queries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    query: text("query").notNull(),
    resultCount: integer("result_count").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("search_queries_created_idx").on(t.createdAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    /** Before/after values of changed fields */
    diff: jsonb("diff"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entity, t.entityId),
    index("audit_logs_created_idx").on(t.createdAt),
  ],
);
