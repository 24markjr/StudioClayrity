import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { productVariants } from "./catalog";
import { createdAt, updatedAt } from "./columns";
import { orders } from "./commerce";
import { inventoryReason, reservationStatus } from "./enums";
import { profiles } from "./customers";

/**
 * Stock per variant. `reserved` is held by unpaid checkouts (see stock_reservations);
 * available = on_hand - reserved. The checks make overselling impossible at the database level.
 */
export const inventory = pgTable(
  "inventory",
  {
    variantId: uuid("variant_id")
      .primaryKey()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(1),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("inventory_on_hand_non_negative", sql`${t.onHand} >= 0`),
    check("inventory_reserved_non_negative", sql`${t.reserved} >= 0`),
    check("inventory_reserved_within_on_hand", sql`${t.reserved} <= ${t.onHand}`),
  ],
);

/** Append-only history of every stock change. */
export const inventoryAdjustments = pgTable(
  "inventory_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    onHandAfter: integer("on_hand_after").notNull(),
    reason: inventoryReason("reason").notNull(),
    /** e.g. order public ref, CSV import id */
    reference: text("reference"),
    note: text("note"),
    actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    check("adjustments_non_zero", sql`${t.delta} <> 0`),
    index("adjustments_variant_idx").on(t.variantId, t.createdAt),
  ],
);

/** Stock held for an unpaid order. Expired by a cron job (Phase 6). */
export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    status: reservationStatus("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("reservations_quantity_positive", sql`${t.quantity} > 0`),
    index("reservations_active_expiry_idx")
      .on(t.expiresAt)
      .where(sql`${t.status} = 'active'`),
    index("reservations_order_idx").on(t.orderId),
  ],
);
