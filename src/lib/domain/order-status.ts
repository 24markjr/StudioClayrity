/**
 * Order state machine. Every status change goes through `assertTransition`, so an order
 * can never jump to an impossible state (e.g. "shipped" before "paid").
 */

export const ORDER_STATUSES = [
  "pending_payment",
  "payment_failed",
  "expired",
  "paid",
  "confirmed_cod",
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancel_requested",
  "cancelled",
  "refund_pending",
  "refunded",
  "return_requested",
  "return_approved",
  "returned",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ["paid", "payment_failed", "expired", "cancelled", "confirmed_cod"],
  // A failed attempt can be retried on the same order
  payment_failed: ["pending_payment", "paid", "expired", "cancelled"],
  // A payment captured after expiry is still recorded (then refunded if stock is gone)
  expired: ["paid"],
  paid: ["processing", "cancel_requested", "cancelled", "refund_pending"],
  confirmed_cod: ["processing", "cancel_requested", "cancelled"],
  processing: ["packed", "cancel_requested", "cancelled", "refund_pending"],
  packed: ["shipped", "cancelled", "refund_pending"],
  shipped: ["out_for_delivery", "delivered", "returned"],
  out_for_delivery: ["delivered", "returned"],
  delivered: ["return_requested"],
  cancel_requested: ["cancelled", "processing", "packed"],
  cancelled: ["refund_pending"],
  refund_pending: ["refunded"],
  refunded: [],
  return_requested: ["return_approved", "delivered"],
  return_approved: ["returned"],
  returned: ["refund_pending"],
};

export function allowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return transitions[from];
}

export function canTransition(from: OrderStatus, to: OrderStatus) {
  return transitions[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(`Order cannot move from "${from}" to "${to}"`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: OrderStatus, to: OrderStatus) {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** States in which the customer may request a cancellation (before packing). */
export function isCancellableByCustomer(status: OrderStatus) {
  return status === "paid" || status === "confirmed_cod" || status === "processing";
}

/** Orders that count as sales in dashboards. */
export const REVENUE_STATUSES: readonly OrderStatus[] = [
  "paid",
  "confirmed_cod",
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "return_requested",
];

/** Customer-facing labels. */
export const orderStatusLabel: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  payment_failed: "Payment failed",
  expired: "Expired",
  paid: "Payment confirmed",
  confirmed_cod: "Order confirmed (cash on delivery)",
  processing: "Being prepared",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancel_requested: "Cancellation requested",
  cancelled: "Cancelled",
  refund_pending: "Refund in progress",
  refunded: "Refunded",
  return_requested: "Return requested",
  return_approved: "Return approved",
  returned: "Returned",
};
