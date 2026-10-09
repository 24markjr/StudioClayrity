import { sql } from "drizzle-orm";
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
import { collections, products, productVariants } from "./catalog";
import { createdAt, updatedAt } from "./columns";
import { profiles } from "./customers";
import {
  couponScope,
  couponType,
  orderStatus,
  paymentProvider,
  paymentStatus,
  refundStatus,
  returnStatus,
  shipmentStatus,
} from "./enums";

/* ---------- Coupons ---------- */

export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stored upper-case */
    code: text("code").notNull().unique(),
    description: text("description"),
    type: couponType("type").notNull(),
    /** percent: basis points (1000 = 10%) · fixed: paise */
    value: integer("value").notNull(),
    minOrderTotal: integer("min_order_total").notNull().default(0),
    /** Cap for percentage coupons, in paise */
    maxDiscount: integer("max_discount"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    usageLimit: integer("usage_limit"),
    perCustomerLimit: integer("per_customer_limit"),
    scope: couponScope("scope").notNull().default("all"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("coupons_code_upper", sql`${t.code} = upper(${t.code})`),
    check("coupons_value_positive", sql`${t.value} > 0`),
    check("coupons_percent_range", sql`${t.type} <> 'percent' OR ${t.value} <= 10000`),
    check(
      "coupons_dates_ordered",
      sql`${t.startsAt} IS NULL OR ${t.endsAt} IS NULL OR ${t.startsAt} < ${t.endsAt}`,
    ),
  ],
);

export const couponProducts = pgTable(
  "coupon_products",
  {
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.couponId, t.productId] })],
);

export const couponCollections = pgTable(
  "coupon_collections",
  {
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.couponId, t.collectionId] })],
);

/* ---------- Carts and wishlists ---------- */

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** SHA-256 of the httpOnly cookie token — the raw token is never stored */
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    couponId: uuid("coupon_id").references(() => coupons.id, { onDelete: "set null" }),
    email: text("email"),
    pincode: text("pincode"),
    giftWrap: boolean("gift_wrap").notNull().default(false),
    giftMessage: text("gift_message"),
    hidePrices: boolean("hide_prices").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("carts_gift_message_length", sql`${t.giftMessage} IS NULL OR length(${t.giftMessage}) <= 200`),
    index("carts_user_idx").on(t.userId),
    index("carts_expiry_idx").on(t.expiresAt),
  ],
);

export const cartItems = pgTable(
  "cart_items",
  {
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    /** Price when added — used only to tell the shopper "price updated", never to charge */
    priceWhenAdded: integer("price_when_added").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.cartId, t.variantId] }),
    check("cart_items_quantity_range", sql`${t.quantity} BETWEEN 1 AND 99`),
  ],
);

export const wishlists = pgTable(
  "wishlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .unique()
      .references(() => profiles.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").unique(),
    createdAt: createdAt(),
  },
  (t) => [check("wishlists_owner", sql`${t.userId} IS NOT NULL OR ${t.tokenHash} IS NOT NULL`)],
);

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    wishlistId: uuid("wishlist_id")
      .notNull()
      .references(() => wishlists.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.wishlistId, t.productId] })],
);

/* ---------- Orders ---------- */

export type AddressSnapshot = {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  stateCode: string;
  pincode: string;
  country: string;
};

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Random, non-sequential customer-facing reference, e.g. SC-7K3Q9X */
    publicRef: text("public_ref").notNull().unique(),
    /** SHA-256 of the token in the guest confirmation link */
    accessTokenHash: text("access_token_hash").notNull(),
    /** Prevents duplicate orders from double submits */
    idempotencyKey: text("idempotency_key").unique(),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    status: orderStatus("status").notNull().default("pending_payment"),
    currency: text("currency").notNull().default("INR"),
    subtotal: integer("subtotal").notNull(),
    discountTotal: integer("discount_total").notNull().default(0),
    shippingTotal: integer("shipping_total").notNull().default(0),
    giftWrapTotal: integer("gift_wrap_total").notNull().default(0),
    codFee: integer("cod_fee").notNull().default(0),
    total: integer("total").notNull(),
    /** GST included in `total` */
    taxTotal: integer("tax_total").notNull().default(0),
    cgst: integer("cgst").notNull().default(0),
    sgst: integer("sgst").notNull().default(0),
    igst: integer("igst").notNull().default(0),
    /** Seller's state at the time of sale (for place-of-supply) */
    sellerStateCode: text("seller_state_code").notNull(),
    shippingAddress: jsonb("shipping_address").$type<AddressSnapshot>().notNull(),
    billingAddress: jsonb("billing_address").$type<AddressSnapshot>().notNull(),
    billingGstin: text("billing_gstin"),
    shippingMethod: text("shipping_method"),
    couponId: uuid("coupon_id").references(() => coupons.id, { onDelete: "set null" }),
    couponCode: text("coupon_code"),
    giftWrap: boolean("gift_wrap").notNull().default(false),
    giftMessage: text("gift_message"),
    hidePrices: boolean("hide_prices").notNull().default(false),
    customerNote: text("customer_note"),
    internalNote: text("internal_note"),
    /** Test-mode orders are excluded from dashboards and reports */
    isTest: boolean("is_test").notNull().default(false),
    invoiceNumber: text("invoice_number").unique(),
    invoiceDate: timestamp("invoice_date", { withTimezone: true }),
    placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "orders_amounts_non_negative",
      sql`${t.subtotal} >= 0 AND ${t.discountTotal} >= 0 AND ${t.shippingTotal} >= 0 AND ${t.giftWrapTotal} >= 0 AND ${t.codFee} >= 0 AND ${t.total} >= 0 AND ${t.taxTotal} >= 0`,
    ),
    check(
      "orders_total_consistent",
      sql`${t.total} = ${t.subtotal} - ${t.discountTotal} + ${t.shippingTotal} + ${t.giftWrapTotal} + ${t.codFee}`,
    ),
    check("orders_tax_split", sql`${t.taxTotal} = ${t.cgst} + ${t.sgst} + ${t.igst}`),
    check("orders_gst_exclusive_split", sql`${t.igst} = 0 OR (${t.cgst} = 0 AND ${t.sgst} = 0)`),
    index("orders_user_idx").on(t.userId),
    index("orders_status_idx").on(t.status, t.placedAt),
    index("orders_email_idx").on(sql`lower(${t.email})`),
    index("orders_placed_idx").on(t.placedAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    // Snapshot — catalogue edits never rewrite order history
    productName: text("product_name").notNull(),
    variantName: text("variant_name"),
    sku: text("sku").notNull(),
    image: text("image"),
    unitPrice: integer("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
    /** Discount allocated to this line, in paise */
    discount: integer("discount").notNull().default(0),
    lineTotal: integer("line_total").notNull(),
    hsnCode: text("hsn_code"),
    gstRateBp: integer("gst_rate_bp").notNull(),
    taxAmount: integer("tax_amount").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("order_items_quantity_positive", sql`${t.quantity} > 0`),
    check("order_items_line_total", sql`${t.lineTotal} = ${t.unitPrice} * ${t.quantity} - ${t.discount}`),
    index("order_items_order_idx").on(t.orderId),
  ],
);

/** Every status change, who made it and why. */
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatus("from_status"),
    toStatus: orderStatus("to_status").notNull(),
    note: text("note"),
    /** "system", "webhook:razorpay", or a profile id */
    actor: text("actor").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

/* ---------- Payments, refunds, webhooks ---------- */

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    provider: paymentProvider("provider").notNull(),
    providerOrderId: text("provider_order_id").unique(),
    providerPaymentId: text("provider_payment_id").unique(),
    method: text("method"),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("INR"),
    status: paymentStatus("status").notNull().default("created"),
    errorCode: text("error_code"),
    errorDescription: text("error_description"),
    /** Provider payload with personal data removed */
    raw: jsonb("raw"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("payments_amount_positive", sql`${t.amount} > 0`), index("payments_order_idx").on(t.orderId)],
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "restrict" }),
    providerRefundId: text("provider_refund_id").unique(),
    amount: integer("amount").notNull(),
    reason: text("reason"),
    status: refundStatus("status").notNull().default("pending"),
    initiatedBy: uuid("initiated_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("refunds_amount_positive", sql`${t.amount} > 0`), index("refunds_order_idx").on(t.orderId)],
);

/** Every incoming webhook, deduplicated by the provider's event id. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [uniqueIndex("webhook_events_provider_event_idx").on(t.provider, t.eventId)],
);

/* ---------- Fulfilment ---------- */

export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    carrier: text("carrier"),
    awb: text("awb"),
    trackingUrl: text("tracking_url"),
    providerShipmentId: text("provider_shipment_id"),
    labelUrl: text("label_url"),
    status: shipmentStatus("status").notNull().default("pending"),
    isInsured: boolean("is_insured").notNull().default(false),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("shipments_order_idx").on(t.orderId), uniqueIndex("shipments_awb_idx").on(t.carrier, t.awb)],
);

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    amount: integer("amount").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("coupon_redemptions_coupon_idx").on(t.couponId),
    index("coupon_redemptions_email_idx").on(sql`lower(${t.email})`),
  ],
);

export const returnRequests = pgTable(
  "return_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** [{ orderItemId, quantity }] */
    items: jsonb("items").$type<Array<{ orderItemId: string; quantity: number }>>().notNull(),
    reason: text("reason").notNull(),
    /** Uploaded photo/video references (breakage claims) */
    media: jsonb("media").$type<string[]>().notNull().default([]),
    status: returnStatus("status").notNull().default("requested"),
    resolutionNote: text("resolution_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("return_requests_order_idx").on(t.orderId)],
);

/** Sequential GST invoice numbers per Indian financial year (April–March). */
export const invoiceSequences = pgTable("invoice_sequences", {
  /** e.g. "26-27" */
  financialYear: text("financial_year").primaryKey(),
  lastNumber: integer("last_number").notNull().default(0),
});
