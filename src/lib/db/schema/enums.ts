import { pgEnum } from "drizzle-orm/pg-core";
import { ORDER_STATUSES } from "../../domain/order-status";

export const userRole = pgEnum("user_role", ["customer", "staff", "admin"]);

export const publishStatus = pgEnum("publish_status", ["draft", "published", "archived"]);

/** unique: one-of-a-kind (stock 1) · stock: repeatable · made_to_order: produced after purchase */
export const uniquenessType = pgEnum("uniqueness_type", ["unique", "stock", "made_to_order"]);

export const imageKind = pgEnum("image_kind", ["hero", "angle", "detail", "scale", "lifestyle"]);

export const slugEntity = pgEnum("slug_entity", ["product", "collection", "category"]);

export const inventoryReason = pgEnum("inventory_reason", [
  "initial",
  "restock",
  "sale",
  "return",
  "damage",
  "manual",
  "correction",
]);

export const reservationStatus = pgEnum("reservation_status", ["active", "consumed", "released", "expired"]);

/** Order lifecycle — transitions are enforced in src/lib/domain/order-status.ts */
export const orderStatus = pgEnum("order_status", ORDER_STATUSES);

export const paymentStatus = pgEnum("payment_status", [
  "created",
  "authorized",
  "captured",
  "failed",
  "refunded",
  "partially_refunded",
]);

export const paymentProvider = pgEnum("payment_provider", ["razorpay", "cod", "manual"]);

export const refundStatus = pgEnum("refund_status", ["pending", "processed", "failed"]);

export const shipmentStatus = pgEnum("shipment_status", [
  "pending",
  "label_created",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "returned",
  "cancelled",
]);

export const couponType = pgEnum("coupon_type", ["percent", "fixed"]);
export const couponScope = pgEnum("coupon_scope", ["all", "products", "collections"]);

export const enquiryType = pgEnum("enquiry_type", [
  "contact",
  "bespoke",
  "more_photos",
  "video_viewing",
  "trade",
]);
export const enquiryStatus = pgEnum("enquiry_status", ["new", "replied", "closed", "spam"]);

export const returnStatus = pgEnum("return_status", [
  "requested",
  "approved",
  "rejected",
  "received",
  "refunded",
]);

export const subscriberStatus = pgEnum("subscriber_status", ["pending", "subscribed", "unsubscribed"]);

export const deliveryStatus = pgEnum("delivery_status", ["queued", "sent", "failed", "skipped"]);
