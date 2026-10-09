"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { getProductsByIds } from "../catalog/repository";
import type { CardProduct } from "../catalog/types";
import { getDb } from "../db/client";
import { generateToken, hashToken } from "../domain/identifiers";
import { getSetting } from "../domain/settings";
import { features } from "../features";
import * as service from "./service";
import { MAX_LINE_QUANTITY, type BagView } from "./types";

/**
 * Bag and wishlist actions called from the browser. Each mutation returns the freshly
 * re-validated bag so the UI always reconciles with the server.
 */

const BAG_COOKIE = "sc_bag";
const WISHLIST_COOKIE = "sc_wishlist";

const cookieOptions = (days: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: days * 86_400,
});

async function tokenHash(name: string) {
  const token = (await cookies()).get(name)?.value;
  return token && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? hashToken(token) : null;
}

/** Returns the hash of the visitor's token, creating and setting the cookie if needed. */
async function ensureTokenHash(name: string, days: number) {
  const existing = await tokenHash(name);
  if (existing) return existing;
  const token = generateToken();
  (await cookies()).set(name, token, cookieOptions(days));
  return hashToken(token);
}

async function bagSettings(): Promise<service.BagSettings> {
  const db = getDb();
  const [shipping, gifting] = await Promise.all([getSetting(db, "shipping"), getSetting(db, "gifting")]);
  return { shipping, gifting };
}

function assertBagEnabled() {
  if (!features.bag) throw new Error("The bag is not available yet.");
}

export type BagActionResult = { bag: BagView; message?: string; tone?: "success" | "error" | "neutral" };

export async function getBag(): Promise<BagView> {
  return service.loadBag(getDb(), await tokenHash(BAG_COOKIE), await bagSettings());
}

async function currentCart() {
  const db = getDb();
  return service.getOrCreateCart(db, await ensureTokenHash(BAG_COOKIE, 30));
}

const lineInput = z.object({
  variantId: z.uuid(),
  quantity: z.number().int().min(0).max(MAX_LINE_QUANTITY),
});

export async function addToBag(input: { variantId: string; quantity: number }): Promise<BagActionResult> {
  assertBagEnabled();
  const { variantId, quantity } = lineInput
    .extend({ quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY) })
    .parse(input);
  const cart = await currentCart();
  const result = await service.addItem(getDb(), cart.id, variantId, quantity);
  const bag = await getBag();
  if (result.status === "unavailable")
    return { bag, tone: "error", message: "Sorry — this piece is no longer available." };
  if (result.status === "limited") {
    return {
      bag,
      tone: "neutral",
      message: `Only ${result.quantity} available, so your bag has ${result.quantity}.`,
    };
  }
  return { bag, tone: "success", message: "Added to your bag." };
}

export async function updateBagQuantity(input: {
  variantId: string;
  quantity: number;
}): Promise<BagActionResult> {
  assertBagEnabled();
  const { variantId, quantity } = lineInput.parse(input);
  const hash = await tokenHash(BAG_COOKIE);
  const cart = hash ? await service.findCart(getDb(), hash) : null;
  if (!cart) return { bag: await getBag() };
  const result = await service.setQuantity(getDb(), cart.id, variantId, quantity);
  const bag = await getBag();
  if (result.status === "limited")
    return { bag, tone: "neutral", message: `Only ${result.quantity} available.` };
  if (result.status === "unavailable")
    return { bag, tone: "error", message: "This piece is no longer available." };
  if (result.status === "removed") return { bag, tone: "neutral", message: "Removed from your bag." };
  return { bag };
}

export async function applyBagCoupon(code: string): Promise<BagActionResult> {
  assertBagEnabled();
  const parsed = z.string().trim().min(1).max(40).safeParse(code);
  if (!parsed.success) return { bag: await getBag(), tone: "error", message: "Enter a code." };
  const cart = await currentCart();
  const result = await service.applyCoupon(getDb(), cart.id, parsed.data, await bagSettings());
  const bag = await getBag();
  return result.ok
    ? { bag, tone: "success", message: "Code applied." }
    : { bag, tone: "error", message: result.message };
}

export async function removeBagCoupon(): Promise<BagActionResult> {
  assertBagEnabled();
  const hash = await tokenHash(BAG_COOKIE);
  const cart = hash ? await service.findCart(getDb(), hash) : null;
  if (cart) await service.removeCoupon(getDb(), cart.id);
  return { bag: await getBag() };
}

const giftInput = z.object({
  giftWrap: z.boolean().optional(),
  giftMessage: z
    .string()
    .trim()
    .max(200, "Gift messages can be up to 200 characters.")
    .transform((v) => v || null)
    .nullable()
    .optional(),
  hidePrices: z.boolean().optional(),
});

export async function updateBagGift(input: z.input<typeof giftInput>): Promise<BagActionResult> {
  assertBagEnabled();
  const parsed = giftInput.safeParse(input);
  if (!parsed.success) return { bag: await getBag(), tone: "error", message: parsed.error.issues[0].message };
  const cart = await currentCart();
  await service.updateCartDetails(getDb(), cart.id, parsed.data);
  return { bag: await getBag() };
}

/* ---------- Wishlist ---------- */

export async function getWishlistIds(): Promise<string[]> {
  if (!features.wishlist) return [];
  const hash = await tokenHash(WISHLIST_COOKIE);
  if (!hash) return [];
  const wishlist = await service.findWishlist(getDb(), hash);
  return service.wishlistProductIds(getDb(), wishlist?.id ?? null);
}

export async function toggleWishlistItem(
  productId: string,
  save: boolean,
): Promise<{ ids: string[]; saved: boolean }> {
  if (!features.wishlist) throw new Error("The wishlist is not available yet.");
  const id = z.uuid().parse(productId);
  const db = getDb();
  const wishlist = await service.getOrCreateWishlist(db, await ensureTokenHash(WISHLIST_COOKIE, 365));
  const saved = await service.toggleWishlist(db, wishlist.id, id, z.boolean().parse(save));
  return { ids: await service.wishlistProductIds(db, wishlist.id), saved };
}

/** Product cards for the wishlist page, in the order they were saved. */
export async function getWishlistProducts(): Promise<CardProduct[]> {
  return getProductsByIds(getDb(), await getWishlistIds());
}
