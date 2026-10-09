import { and, asc, count, eq, gt, inArray, sql } from "drizzle-orm";
import type { Database, Executor } from "../db/create";
import {
  cartItems,
  carts,
  collectionProducts,
  couponCollections,
  couponProducts,
  couponRedemptions,
  coupons,
  inventory,
  productImages,
  products,
  productVariants,
  wishlistItems,
  wishlists,
} from "../db/schema";
import { couponMessages, evaluateCoupon, normaliseCouponCode } from "../domain/coupons";
import { estimateShipping } from "../domain/shipping-rules";
import type { SettingValue } from "../domain/settings";
import { formatMoney } from "../utils/money";
import { EMPTY_BAG, MAX_LINE_QUANTITY, type BagLine, type BagNotice, type BagView } from "./types";

/**
 * Bag and wishlist persistence. The bag lives in the database, found by the SHA-256 hash of
 * an httpOnly cookie token. Every read re-validates against the catalogue — prices, stock,
 * publication and coupon rules — so the bag can never show a stale promise.
 */

const CART_LIFETIME_DAYS = 30;

export type BagSettings = {
  shipping: SettingValue<"shipping">;
  gifting: SettingValue<"gifting">;
};

function expiry(now = new Date()) {
  return new Date(now.getTime() + CART_LIFETIME_DAYS * 86_400_000);
}

export async function findCart(db: Executor, tokenHash: string, now = new Date()) {
  const [cart] = await db
    .select()
    .from(carts)
    .where(and(eq(carts.tokenHash, tokenHash), gt(carts.expiresAt, now)));
  return cart ?? null;
}

export async function getOrCreateCart(db: Executor, tokenHash: string, now = new Date()) {
  const existing = await findCart(db, tokenHash, now);
  if (existing) return existing;
  const [created] = await db
    .insert(carts)
    .values({ tokenHash, expiresAt: expiry(now) })
    .onConflictDoUpdate({ target: carts.tokenHash, set: { expiresAt: expiry(now) } })
    .returning();
  return created;
}

async function touch(db: Executor, cartId: string) {
  await db.update(carts).set({ expiresAt: expiry() }).where(eq(carts.id, cartId));
}

/** Current purchasability of a variant: price, publication and how many can be held. */
async function variantState(db: Executor, variantId: string) {
  const [row] = await db
    .select({
      price: productVariants.price,
      isActive: productVariants.isActive,
      track: productVariants.trackInventory,
      status: products.status,
      uniqueness: products.uniquenessType,
      onHand: inventory.onHand,
      reserved: inventory.reserved,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(eq(productVariants.id, variantId));
  if (!row) return null;
  const purchasable = row.isActive && row.status === "published";
  const stockCap = row.track ? Math.max(0, (row.onHand ?? 0) - (row.reserved ?? 0)) : MAX_LINE_QUANTITY;
  const cap = !purchasable ? 0 : Math.min(stockCap, row.uniqueness === "unique" ? 1 : MAX_LINE_QUANTITY);
  return { price: row.price, cap };
}

export type LineResult =
  | { status: "added" | "updated" | "removed"; quantity: number }
  | { status: "limited"; quantity: number; requested: number }
  | { status: "unavailable" };

/** Add `quantity` of a variant, capped by stock and the one-of-a-kind rule. */
export async function addItem(
  db: Database,
  cartId: string,
  variantId: string,
  quantity: number,
): Promise<LineResult> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY)
    throw new RangeError("Invalid quantity");
  return db.transaction(async (tx) => {
    const state = await variantState(tx, variantId);
    if (!state || state.cap === 0) return { status: "unavailable" as const };
    const [existing] = await tx
      .select({ quantity: cartItems.quantity })
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)));
    const requested = (existing?.quantity ?? 0) + quantity;
    const final = Math.min(requested, state.cap);
    if (existing && final === existing.quantity && final < requested) {
      return { status: "limited" as const, quantity: final, requested };
    }
    await tx
      .insert(cartItems)
      .values({ cartId, variantId, quantity: final, priceWhenAdded: state.price })
      .onConflictDoUpdate({
        target: [cartItems.cartId, cartItems.variantId],
        set: { quantity: final, priceWhenAdded: state.price, updatedAt: new Date() },
      });
    await touch(tx, cartId);
    return final < requested
      ? { status: "limited" as const, quantity: final, requested }
      : { status: "added" as const, quantity: final };
  });
}

/** Set a line's quantity; 0 removes it. */
export async function setQuantity(
  db: Database,
  cartId: string,
  variantId: string,
  quantity: number,
): Promise<LineResult> {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_LINE_QUANTITY)
    throw new RangeError("Invalid quantity");
  return db.transaction(async (tx) => {
    if (quantity === 0) {
      await tx.delete(cartItems).where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)));
      await touch(tx, cartId);
      return { status: "removed" as const, quantity: 0 };
    }
    const state = await variantState(tx, variantId);
    if (!state || state.cap === 0) return { status: "unavailable" as const };
    const final = Math.min(quantity, state.cap);
    const updated = await tx
      .update(cartItems)
      .set({ quantity: final, updatedAt: new Date() })
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)))
      .returning({ quantity: cartItems.quantity });
    if (updated.length === 0) return { status: "unavailable" as const };
    await touch(tx, cartId);
    return final < quantity
      ? { status: "limited" as const, quantity: final, requested: quantity }
      : { status: "updated" as const, quantity: final };
  });
}

export async function updateCartDetails(
  db: Executor,
  cartId: string,
  details: Partial<{
    giftWrap: boolean;
    giftMessage: string | null;
    hidePrices: boolean;
    pincode: string | null;
  }>,
) {
  await db
    .update(carts)
    .set({ ...details, expiresAt: expiry() })
    .where(eq(carts.id, cartId));
}

/** Attach a coupon if it currently applies; returns a customer-facing reason if not. */
export async function applyCoupon(db: Database, cartId: string, rawCode: string, settings: BagSettings) {
  const code = normaliseCouponCode(rawCode);
  if (!code || code.length > 40) return { ok: false as const, message: "Enter a code." };
  const [coupon] = await db.select({ id: coupons.id }).from(coupons).where(eq(coupons.code, code));
  if (!coupon) return { ok: false as const, message: "That code isn't valid." };

  await db.update(carts).set({ couponId: coupon.id }).where(eq(carts.id, cartId));
  const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
  const view = await buildBagView(db, cart, settings);
  const removed = view.notices.find((n) => n.kind === "coupon_removed");
  return removed ? { ok: false as const, message: removed.message } : { ok: true as const };
}

export async function removeCoupon(db: Executor, cartId: string) {
  await db.update(carts).set({ couponId: null }).where(eq(carts.id, cartId));
}

/** Read the bag, correcting it against the catalogue and reporting what changed. */
export async function loadBag(
  db: Database,
  tokenHash: string | null,
  settings: BagSettings,
): Promise<BagView> {
  if (!tokenHash)
    return { ...EMPTY_BAG, giftWrap: { ...EMPTY_BAG.giftWrap, offered: settings.gifting.wrapEnabled } };
  const cart = await findCart(db, tokenHash);
  if (!cart)
    return { ...EMPTY_BAG, giftWrap: { ...EMPTY_BAG.giftWrap, offered: settings.gifting.wrapEnabled } };
  return buildBagView(db, cart, settings);
}

async function lineImages(db: Executor, productIds: string[]) {
  if (productIds.length === 0) return [];
  return db
    .select({
      productId: productImages.productId,
      variantId: productImages.variantId,
      src: productImages.src,
      alt: productImages.alt,
    })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(sql`${productImages.kind} = 'hero' desc`, asc(productImages.position));
}

export async function buildBagView(
  db: Database,
  cart: typeof carts.$inferSelect,
  settings: BagSettings,
): Promise<BagView> {
  const rows = await db
    .select({
      variantId: cartItems.variantId,
      quantity: cartItems.quantity,
      priceWhenAdded: cartItems.priceWhenAdded,
      productId: products.id,
      slug: products.slug,
      name: products.name,
      status: products.status,
      uniqueness: products.uniquenessType,
      leadTimeDays: products.leadTimeDays,
      variantName: productVariants.name,
      sku: productVariants.sku,
      price: productVariants.price,
      isActive: productVariants.isActive,
      track: productVariants.trackInventory,
      onHand: inventory.onHand,
      reserved: inventory.reserved,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(eq(cartItems.cartId, cart.id))
    .orderBy(asc(cartItems.createdAt));

  const images = await lineImages(db, [...new Set(rows.map((r) => r.productId))]);
  const notices: BagNotice[] = [];
  const lines: BagLine[] = [];

  for (const r of rows) {
    const purchasable = r.isActive && r.status === "published";
    const stock = r.track ? Math.max(0, (r.onHand ?? 0) - (r.reserved ?? 0)) : MAX_LINE_QUANTITY;
    const cap = purchasable ? Math.min(stock, r.uniqueness === "unique" ? 1 : MAX_LINE_QUANTITY) : 0;
    const label = r.variantName ? `${r.name} (${r.variantName})` : r.name;
    let quantity = r.quantity;

    if (cap === 0) {
      notices.push({
        kind: "unavailable",
        variantId: r.variantId,
        message:
          r.uniqueness === "unique" ? `${label} has just found a home.` : `${label} is no longer available.`,
      });
    } else if (quantity > cap) {
      quantity = cap;
      await db
        .update(cartItems)
        .set({ quantity })
        .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, r.variantId)));
      notices.push({
        kind: "quantity_reduced",
        variantId: r.variantId,
        message: `Only ${cap} of ${label} ${cap === 1 ? "is" : "are"} available, so we've updated your bag.`,
      });
    }

    if (cap > 0 && r.price !== r.priceWhenAdded) {
      notices.push({
        kind: "price_changed",
        variantId: r.variantId,
        message: `The price of ${label} has changed from ${formatMoney(r.priceWhenAdded)} to ${formatMoney(r.price)}.`,
      });
      // Shown once; the bag now reflects the new price
      await db
        .update(cartItems)
        .set({ priceWhenAdded: r.price })
        .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, r.variantId)));
    }

    const image =
      images.find((i) => i.productId === r.productId && i.variantId === r.variantId) ??
      images.find((i) => i.productId === r.productId && !i.variantId) ??
      images.find((i) => i.productId === r.productId);

    lines.push({
      variantId: r.variantId,
      productId: r.productId,
      slug: r.slug,
      name: r.name,
      variantName: r.variantName,
      sku: r.sku,
      image: image ? { src: image.src, alt: image.alt } : null,
      unitPrice: r.price,
      quantity,
      lineTotal: cap > 0 ? r.price * quantity : 0,
      maxQuantity: cap,
      uniqueness: r.uniqueness,
      leadTimeDays: r.leadTimeDays,
      available: cap > 0,
    });
  }

  const buyable = lines.filter((l) => l.available);
  const subtotal = buyable.reduce((sum, l) => sum + l.lineTotal, 0);

  // Coupon: re-evaluated on every read
  let coupon: BagView["coupon"] = null;
  if (cart.couponId) {
    const evaluated = await evaluateCartCoupon(db, cart.couponId, buyable, subtotal);
    if (evaluated.ok) coupon = evaluated.coupon;
    else {
      await removeCoupon(db, cart.id);
      notices.push({ kind: "coupon_removed", message: evaluated.message });
    }
  }

  const discount = coupon?.discount ?? 0;
  const giftWrapSelected = settings.gifting.wrapEnabled && cart.giftWrap;
  const giftWrapPrice = giftWrapSelected && buyable.length > 0 ? settings.gifting.wrapPrice : 0;
  const shipping =
    buyable.length > 0
      ? estimateShipping(settings.shipping, subtotal - discount)
      : ({ status: "unconfirmed" } as const);
  const shippingAmount = shipping.status === "quoted" ? shipping.amount : 0;

  return {
    lines,
    itemCount: buyable.reduce((sum, l) => sum + l.quantity, 0),
    subtotal,
    coupon,
    giftWrap: {
      offered: settings.gifting.wrapEnabled,
      selected: giftWrapSelected,
      price: settings.gifting.wrapPrice,
    },
    giftMessage: cart.giftMessage,
    hidePrices: cart.hidePrices,
    pincode: cart.pincode,
    shipping,
    total: subtotal - discount + giftWrapPrice + shippingAmount,
    notices,
  };
}

async function evaluateCartCoupon(db: Executor, couponId: string, lines: BagLine[], subtotal: number) {
  const [c] = await db.select().from(coupons).where(eq(coupons.id, couponId));
  if (!c) return { ok: false as const, message: "That code is no longer available." };

  let eligibleSubtotal = subtotal;
  if (c.scope !== "all") {
    const productIds = lines.map((l) => l.productId);
    const eligible = new Set<string>();
    if (productIds.length) {
      const rows =
        c.scope === "products"
          ? await db
              .select({ productId: couponProducts.productId })
              .from(couponProducts)
              .where(and(eq(couponProducts.couponId, c.id), inArray(couponProducts.productId, productIds)))
          : await db
              .selectDistinct({ productId: collectionProducts.productId })
              .from(couponCollections)
              .innerJoin(
                collectionProducts,
                eq(collectionProducts.collectionId, couponCollections.collectionId),
              )
              .where(
                and(eq(couponCollections.couponId, c.id), inArray(collectionProducts.productId, productIds)),
              );
      for (const r of rows) eligible.add(r.productId);
    }
    eligibleSubtotal = lines.filter((l) => eligible.has(l.productId)).reduce((s, l) => s + l.lineTotal, 0);
  }

  const [{ used }] = await db
    .select({ used: count() })
    .from(couponRedemptions)
    .where(eq(couponRedemptions.couponId, c.id));
  const result = evaluateCoupon(
    {
      code: c.code,
      type: c.type,
      value: c.value,
      minOrderTotal: c.minOrderTotal,
      maxDiscount: c.maxDiscount,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      usageLimit: c.usageLimit,
      // Per-customer limits need the shopper's email, so they're checked at checkout
      perCustomerLimit: null,
      isActive: c.isActive,
    },
    { eligibleSubtotal, orderSubtotal: subtotal, now: new Date(), timesUsed: used, timesUsedByCustomer: 0 },
  );
  if (!result.ok) {
    const message =
      result.reason === "minimum_not_met"
        ? `${c.code} needs a minimum order of ${formatMoney(c.minOrderTotal)}.`
        : couponMessages[result.reason];
    return { ok: false as const, message };
  }
  return {
    ok: true as const,
    coupon: { code: c.code, discount: result.discount, description: c.description },
  };
}

/**
 * Sign-in (Phase 9): move a guest bag into the customer's bag. Quantities combine within
 * stock limits; the customer's coupon wins, otherwise the guest's carries over.
 */
export async function mergeCarts(db: Database, fromCartId: string, intoCartId: string) {
  if (fromCartId === intoCartId) return;
  const items = await db.select().from(cartItems).where(eq(cartItems.cartId, fromCartId));
  for (const item of items) {
    const result = await addItem(db, intoCartId, item.variantId, Math.min(item.quantity, MAX_LINE_QUANTITY));
    void result; // unavailable items are simply dropped
  }
  const [[from], [into]] = await Promise.all([
    db.select().from(carts).where(eq(carts.id, fromCartId)),
    db.select().from(carts).where(eq(carts.id, intoCartId)),
  ]);
  if (from && into && !into.couponId && from.couponId) {
    await db.update(carts).set({ couponId: from.couponId }).where(eq(carts.id, intoCartId));
  }
  await db.delete(carts).where(eq(carts.id, fromCartId));
}

/* ---------- Wishlist ---------- */

export async function findWishlist(db: Executor, tokenHash: string) {
  const [row] = await db.select().from(wishlists).where(eq(wishlists.tokenHash, tokenHash));
  return row ?? null;
}

export async function getOrCreateWishlist(db: Executor, tokenHash: string) {
  const existing = await findWishlist(db, tokenHash);
  if (existing) return existing;
  const [created] = await db
    .insert(wishlists)
    .values({ tokenHash })
    .onConflictDoUpdate({ target: wishlists.tokenHash, set: { tokenHash } })
    .returning();
  return created;
}

export async function wishlistProductIds(db: Executor, wishlistId: string | null) {
  if (!wishlistId) return [];
  const rows = await db
    .select({ productId: wishlistItems.productId })
    .from(wishlistItems)
    .innerJoin(products, eq(products.id, wishlistItems.productId))
    .where(and(eq(wishlistItems.wishlistId, wishlistId), eq(products.status, "published")))
    .orderBy(asc(wishlistItems.createdAt));
  return rows.map((r) => r.productId);
}

/** Add or remove; returns whether the product is now saved. */
export async function toggleWishlist(db: Database, wishlistId: string, productId: string, save?: boolean) {
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.status, "published")));
  if (!product) throw new Error("Product not found");
  const [existing] = await db
    .select()
    .from(wishlistItems)
    .where(and(eq(wishlistItems.wishlistId, wishlistId), eq(wishlistItems.productId, productId)));
  const shouldSave = save ?? !existing;
  if (shouldSave && !existing)
    await db.insert(wishlistItems).values({ wishlistId, productId }).onConflictDoNothing();
  if (!shouldSave && existing) {
    await db
      .delete(wishlistItems)
      .where(and(eq(wishlistItems.wishlistId, wishlistId), eq(wishlistItems.productId, productId)));
  }
  return shouldSave;
}

export async function mergeWishlists(db: Executor, fromId: string, intoId: string) {
  if (fromId === intoId) return;
  await db.execute(sql`insert into ${wishlistItems} (wishlist_id, product_id, created_at)
    select ${intoId}, product_id, created_at from ${wishlistItems} where wishlist_id = ${fromId}
    on conflict do nothing`);
  await db.delete(wishlists).where(eq(wishlists.id, fromId));
}
