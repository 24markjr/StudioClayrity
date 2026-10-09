"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getDb } from "../db/client";
import { isValidPincode } from "../domain/india";
import { clientKey, getRateLimiter } from "../security/rate-limit";
import { getServices } from "../services";
import { findOrderForTracking } from "./tracking";

export type TrackState =
  | { status: "idle" }
  | { status: "error"; message: string; values: { orderRef: string; contact: string } }
  | {
      status: "found";
      order: {
        orderRef: string;
        statusLabel: string;
        placedAt: string;
        timeline: Array<{ label: string; at: string }>;
        shipment: { carrier: string | null; awb: string | null; trackingUrl: string | null } | null;
        items: Array<{ name: string; quantity: number }>;
      };
    };

const input = z.object({
  orderRef: z.string().trim().min(4).max(20),
  contact: z.string().trim().min(5).max(254),
});

const NOT_FOUND =
  "We couldn't find an order with those details. Check the order number and use the email or phone number from checkout.";

export async function trackOrder(_prev: TrackState, formData: FormData): Promise<TrackState> {
  const values = {
    orderRef: String(formData.get("orderRef") ?? ""),
    contact: String(formData.get("contact") ?? ""),
  };
  const parsed = input.safeParse(values);
  if (!parsed.success)
    return { status: "error", message: "Enter your order number and the email or phone you used.", values };

  const limit = await getRateLimiter().check(`track:${clientKey(await headers())}`, 10, 600);
  if (!limit.allowed) {
    return {
      status: "error",
      message: `Too many attempts. Please try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
      values,
    };
  }

  const found = await findOrderForTracking(getDb(), parsed.data);
  if (!found) return { status: "error", message: NOT_FOUND, values };
  const latest = found.timeline.at(-1)?.label ?? "Order placed";
  return {
    status: "found",
    order: {
      orderRef: found.orderRef,
      statusLabel: latest,
      placedAt: found.placedAt.toISOString(),
      timeline: found.timeline.map((t) => ({ label: t.label, at: t.at.toISOString() })),
      shipment: found.shipment,
      items: found.items,
    },
  };
}

export type DeliveryCheck =
  | { status: "serviceable"; message: string }
  | { status: "not_serviceable"; message: string }
  | { status: "error"; message: string };

/** Product page "Check delivery": does a courier serve this PIN code? */
export async function checkDelivery(pincode: string, weightG: number): Promise<DeliveryCheck> {
  if (!isValidPincode(pincode.trim())) return { status: "error", message: "Enter a 6-digit PIN code." };
  const limit = await getRateLimiter().check(`pincode:${clientKey(await headers())}`, 30, 600);
  if (!limit.allowed) return { status: "error", message: "Please try again in a few minutes." };
  try {
    const result = await getServices().shipping.checkServiceability({
      deliveryPincode: pincode.trim(),
      weightG: Math.max(100, Math.min(Math.round(weightG) || 1000, 50_000)),
      cod: false,
    });
    if (result.status === "not_serviceable") {
      return { status: "not_serviceable", message: `Sorry — we can't deliver to ${pincode} yet.` };
    }
    if (result.status === "serviceable") {
      const eta = result.etaDays
        ? result.etaDays.min === result.etaDays.max
          ? `about ${result.etaDays.min} days`
          : `${result.etaDays.min}–${result.etaDays.max} days`
        : null;
      return {
        status: "serviceable",
        message: `We deliver to ${pincode}${eta ? ` — usually ${eta} after dispatch` : ""}.`,
      };
    }
    return { status: "error", message: "We'll confirm delivery to this PIN code at checkout." };
  } catch {
    return { status: "error", message: "We couldn't check right now. We'll confirm delivery at checkout." };
  }
}
