import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seed } from "../../scripts/seed";
import {
  addItem,
  applyCoupon,
  getOrCreateCart,
  getOrCreateWishlist,
  loadBag,
  mergeCarts,
  mergeWishlists,
  removeCoupon,
  setQuantity,
  toggleWishlist,
  updateCartDetails,
  wishlistProductIds,
  type BagSettings,
} from "../../src/lib/cart/service";
import { carts, coupons, inventory, products, productVariants, wishlists } from "../../src/lib/db/schema";
import { generateToken, hashToken } from "../../src/lib/domain/identifiers";
import { openTestDb } from "./helpers";

const { db } = openTestDb();

const settings: BagSettings = {
  shipping: {
    ratesConfirmed: true,
    flatRate: 50_000,
    freeAbove: 1_500_000,
    expressRate: null,
    chargesGstRateBp: 1800,
  },
  gifting: { wrapEnabled: true, wrapPrice: 25_000 },
};

let ids: Record<string, string> = {};
const variant = (sku: string) => ids[sku];

async function newCart() {
  const token = hashToken(generateToken());
  const cart = await getOrCreateCart(db, token);
  return { cart, token };
}

beforeAll(async () => {
  await seed(db, { appEnv: "test" });
  const rows = await db.select({ id: productVariants.id, sku: productVariants.sku }).from(productVariants);
  ids = Object.fromEntries(rows.map((r) => [r.sku, r.id]));
});

beforeEach(async () => {
  await db.update(inventory).set({ reserved: 0 });
  await db
    .update(inventory)
    .set({ onHand: 4 })
    .where(eq(inventory.variantId, variant("SAMPLE-TRAY-001-L")));
  await db
    .update(inventory)
    .set({ onHand: 1 })
    .where(eq(inventory.variantId, variant("SAMPLE-BOWL-001")));
  await db
    .update(productVariants)
    .set({ price: 850_000 })
    .where(eq(productVariants.sku, "SAMPLE-TRAY-001-L"));
  await db.update(products).set({ status: "published" });
});

describe("adding to the bag", () => {
  it("adds, combines quantities and totals at current prices", async () => {
    const { cart, token } = await newCart();
    expect(await addItem(db, cart.id, variant("SAMPLE-TRAY-001-L"), 1)).toEqual({
      status: "added",
      quantity: 1,
    });
    expect(await addItem(db, cart.id, variant("SAMPLE-TRAY-001-L"), 2)).toEqual({
      status: "added",
      quantity: 3,
    });
    const bag = await loadBag(db, token, settings);
    expect(bag.itemCount).toBe(3);
    expect(bag.subtotal).toBe(2_550_000);
    expect(bag.lines[0]).toMatchObject({ name: "Travertine Tray", variantName: "Large", maxQuantity: 4 });
    expect(bag.lines[0].image?.src).toMatch(/^placeholder:/);
  });

  it("caps at available stock and says so", async () => {
    const { cart } = await newCart();
    expect(await addItem(db, cart.id, variant("SAMPLE-TRAY-001-L"), 6)).toEqual({
      status: "limited",
      quantity: 4,
      requested: 6,
    });
    expect(await addItem(db, cart.id, variant("SAMPLE-TRAY-001-L"), 1)).toEqual({
      status: "limited",
      quantity: 4,
      requested: 5,
    });
  });

  it("allows only one of a one-of-a-kind piece", async () => {
    const { cart } = await newCart();
    await addItem(db, cart.id, variant("SAMPLE-BOWL-001"), 1);
    expect(await addItem(db, cart.id, variant("SAMPLE-BOWL-001"), 1)).toMatchObject({
      status: "limited",
      quantity: 1,
    });
  });

  it("refuses sold-out and unpublished pieces", async () => {
    const { cart } = await newCart();
    expect(await addItem(db, cart.id, variant("SAMPLE-BOOK-001"), 1)).toEqual({ status: "unavailable" });
    await db.update(products).set({ status: "draft" }).where(eq(products.slug, "coaster-set"));
    expect(await addItem(db, cart.id, variant("SAMPLE-CSTR-001"), 1)).toEqual({ status: "unavailable" });
  });

  it("does not stock-limit made-to-order pieces beyond the per-line cap", async () => {
    const { cart } = await newCart();
    expect(await addItem(db, cart.id, variant("SAMPLE-VASE-001"), 10)).toEqual({
      status: "added",
      quantity: 10,
    });
  });

  it("counts stock held for unpaid orders as unavailable", async () => {
    await db
      .update(inventory)
      .set({ reserved: 1 })
      .where(eq(inventory.variantId, variant("SAMPLE-BOWL-001")));
    const { cart } = await newCart();
    expect(await addItem(db, cart.id, variant("SAMPLE-BOWL-001"), 1)).toEqual({ status: "unavailable" });
  });
});

describe("re-validation on every read", () => {
  it("reduces quantities when stock falls and explains why", async () => {
    const { cart, token } = await newCart();
    await addItem(db, cart.id, variant("SAMPLE-TRAY-001-L"), 4);
    await db
      .update(inventory)
      .set({ onHand: 2 })
      .where(eq(inventory.variantId, variant("SAMPLE-TRAY-001-L")));
    const bag = await loadBag(db, token, settings);
    expect(bag.lines[0].quantity).toBe(2);
    expect(bag.notices).toEqual([
      expect.objectContaining({ kind: "quantity_reduced", message: expect.stringContaining("Only 2") }),
    ]);
    // Persisted: the next read is clean
    expect((await loadBag(db, token, settings)).notices).toEqual([]);
  });

  it("flags a piece that sold elsewhere and excludes it from totals", async () => {
    const { cart, token } = await newCart();
    await addItem(db, cart.id, variant("SAMPLE-BOWL-001"), 1);
    await addItem(db, cart.id, variant("SAMPLE-DISH-001"), 1);
    await db
      .update(inventory)
      .set({ onHand: 0 })
      .where(eq(inventory.variantId, variant("SAMPLE-BOWL-001")));
    const bag = await loadBag(db, token, settings);
    expect(bag.lines.find((l) => l.sku === "SAMPLE-BOWL-001")).toMatchObject({
      available: false,
      lineTotal: 0,
    });
    expect(bag.subtotal).toBe(250_000);
    expect(bag.itemCount).toBe(1);
    expect(bag.notices[0]).toMatchObject({
      kind: "unavailable",
      message: "Nero Marble Bowl has just found a home.",
    });
  });

  it("charges the current price and announces a change once", async () => {
    const { cart, token } = await newCart();
    await addItem(db, cart.id, variant("SAMPLE-TRAY-001-L"), 1);
    await db
      .update(productVariants)
      .set({ price: 900_000 })
      .where(eq(productVariants.sku, "SAMPLE-TRAY-001-L"));
    const bag = await loadBag(db, token, settings);
    expect(bag.subtotal).toBe(900_000);
    expect(bag.notices[0]).toMatchObject({
      kind: "price_changed",
      message: expect.stringContaining("₹8,500 to ₹9,000"),
    });
    expect((await loadBag(db, token, settings)).notices).toEqual([]);
  });

  it("returns an empty bag for unknown or expired carts", async () => {
    expect((await loadBag(db, null, settings)).lines).toEqual([]);
    const { cart, token } = await newCart();
    await addItem(db, cart.id, variant("SAMPLE-DISH-001"), 1);
    await db
      .update(carts)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(carts.id, cart.id));
    expect((await loadBag(db, token, settings)).lines).toEqual([]);
  });
});

describe("quantities", () => {
  it("updates, caps and removes", async () => {
    const { cart, token } = await newCart();
    await addItem(db, cart.id, variant("SAMPLE-TRAY-001-L"), 1);
    expect(await setQuantity(db, cart.id, variant("SAMPLE-TRAY-001-L"), 3)).toEqual({
      status: "updated",
      quantity: 3,
    });
    expect(await setQuantity(db, cart.id, variant("SAMPLE-TRAY-001-L"), 9)).toEqual({
      status: "limited",
      quantity: 4,
      requested: 9,
    });
    expect(await setQuantity(db, cart.id, variant("SAMPLE-TRAY-001-L"), 0)).toEqual({
      status: "removed",
      quantity: 0,
    });
    expect((await loadBag(db, token, settings)).lines).toEqual([]);
  });

  it("rejects invalid quantities", async () => {
    const { cart } = await newCart();
    await expect(setQuantity(db, cart.id, variant("SAMPLE-TRAY-001-L"), -1)).rejects.toThrow(RangeError);
    await expect(addItem(db, cart.id, variant("SAMPLE-TRAY-001-L"), 0)).rejects.toThrow(RangeError);
  });
});

describe("coupons", () => {
  it("applies a valid code and discounts the total", async () => {
    const { cart, token } = await newCart();
    await addItem(db, cart.id, variant("SAMPLE-TRAY-001-L"), 1);
    expect(await applyCoupon(db, cart.id, " sample10 ", settings)).toEqual({ ok: true });
    const bag = await loadBag(db, token, settings);
    expect(bag.coupon).toMatchObject({ code: "SAMPLE10", discount: 85_000 });
    expect(bag.total).toBe(850_000 - 85_000 + 50_000);
  });

  it("explains why a code doesn't apply and doesn't keep it", async () => {
    const { cart, token } = await newCart();
    await addItem(db, cart.id, variant("SAMPLE-DISH-001"), 1);
    expect(await applyCoupon(db, cart.id, "SAMPLE10", settings)).toEqual({
      ok: false,
      message: "SAMPLE10 needs a minimum order of ₹5,000.",
    });
    expect(await applyCoupon(db, cart.id, "NOPE", settings)).toEqual({
      ok: false,
      message: "That code isn't valid.",
    });
    expect((await loadBag(db, token, settings)).coupon).toBeNull();
  });

  it("drops a coupon when the bag no longer qualifies", async () => {
    const { cart, token } = await newCart();
    await addItem(db, cart.id, variant("SAMPLE-TRAY-001-L"), 1);
    await applyCoupon(db, cart.id, "SAMPLE10", settings);
    await setQuantity(db, cart.id, variant("SAMPLE-TRAY-001-L"), 0);
    await addItem(db, cart.id, variant("SAMPLE-DISH-001"), 1);
    const bag = await loadBag(db, token, settings);
    expect(bag.coupon).toBeNull();
    expect(bag.notices).toEqual([expect.objectContaining({ kind: "coupon_removed" })]);
  });

  it("rejects an expired code", async () => {
    await db
      .update(coupons)
      .set({ endsAt: new Date(Date.now() - 1000) })
      .where(eq(coupons.code, "SAMPLE500"));
    const { cart } = await newCart();
    await addItem(db, cart.id, variant("SAMPLE-TRAY-001-L"), 2);
    expect(await applyCoupon(db, cart.id, "SAMPLE500", settings)).toEqual({
      ok: false,
      message: "This code has expired.",
    });
    await db.update(coupons).set({ endsAt: null }).where(eq(coupons.code, "SAMPLE500"));
  });

  it("can be removed", async () => {
    const { cart, token } = await newCart();
    await addItem(db, cart.id, variant("SAMPLE-TRAY-001-L"), 1);
    await applyCoupon(db, cart.id, "SAMPLE10", settings);
    await removeCoupon(db, cart.id);
    expect((await loadBag(db, token, settings)).coupon).toBeNull();
  });
});

describe("gift options and shipping", () => {
  it("adds gift wrap when offered and shows the free-shipping gap", async () => {
    const { cart, token } = await newCart();
    await addItem(db, cart.id, variant("SAMPLE-TRAY-001-L"), 1);
    await updateCartDetails(db, cart.id, {
      giftWrap: true,
      giftMessage: "Happy housewarming",
      hidePrices: true,
    });
    const bag = await loadBag(db, token, settings);
    expect(bag.giftWrap).toEqual({ offered: true, selected: true, price: 25_000 });
    expect(bag).toMatchObject({ giftMessage: "Happy housewarming", hidePrices: true });
    expect(bag.shipping).toMatchObject({ status: "quoted", amount: 50_000, amountToFree: 650_000 });
    expect(bag.total).toBe(850_000 + 25_000 + 50_000);
  });

  it("ignores a stored gift wrap choice when wrapping is switched off", async () => {
    const { cart, token } = await newCart();
    await addItem(db, cart.id, variant("SAMPLE-TRAY-001-L"), 1);
    await updateCartDetails(db, cart.id, { giftWrap: true });
    const bag = await loadBag(db, token, { ...settings, gifting: { wrapEnabled: false, wrapPrice: 25_000 } });
    expect(bag.giftWrap.selected).toBe(false);
    expect(bag.total).toBe(850_000 + 50_000);
  });

  it("does not quote shipping until rates are confirmed", async () => {
    const { cart, token } = await newCart();
    await addItem(db, cart.id, variant("SAMPLE-TRAY-001-L"), 1);
    const bag = await loadBag(db, token, {
      ...settings,
      shipping: { ...settings.shipping, ratesConfirmed: false },
    });
    expect(bag.shipping).toEqual({ status: "unconfirmed" });
    expect(bag.total).toBe(850_000);
  });

  it("enforces the 200-character gift message limit in the database", async () => {
    const { cart } = await newCart();
    await expect(updateCartDetails(db, cart.id, { giftMessage: "x".repeat(201) })).rejects.toThrow();
  });
});

describe("merging on sign-in", () => {
  it("combines quantities within stock and keeps the guest coupon", async () => {
    const guest = await newCart();
    const customer = await newCart();
    await addItem(db, guest.cart.id, variant("SAMPLE-TRAY-001-L"), 3);
    await addItem(db, customer.cart.id, variant("SAMPLE-TRAY-001-L"), 2);
    await applyCoupon(db, guest.cart.id, "SAMPLE10", settings);
    await mergeCarts(db, guest.cart.id, customer.cart.id);
    const bag = await loadBag(db, customer.token, settings);
    expect(bag.lines[0].quantity).toBe(4);
    expect(bag.coupon?.code).toBe("SAMPLE10");
    expect((await loadBag(db, guest.token, settings)).lines).toEqual([]);
  });
});

describe("wishlist", () => {
  it("toggles, lists only published products and merges", async () => {
    const [bowl] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, "nero-marble-bowl"));
    const [tray] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, "travertine-tray"));
    const a = await getOrCreateWishlist(db, hashToken(generateToken()));
    const b = await getOrCreateWishlist(db, hashToken(generateToken()));

    expect(await toggleWishlist(db, a.id, bowl.id)).toBe(true);
    expect(await toggleWishlist(db, a.id, bowl.id)).toBe(false);
    await toggleWishlist(db, a.id, bowl.id, true);
    await toggleWishlist(db, b.id, tray.id, true);
    await toggleWishlist(db, b.id, bowl.id, true);

    await mergeWishlists(db, a.id, b.id);
    expect((await wishlistProductIds(db, b.id)).sort()).toEqual([bowl.id, tray.id].sort());
    expect(await db.select().from(wishlists).where(eq(wishlists.id, a.id))).toEqual([]);

    await db.update(products).set({ status: "draft" }).where(eq(products.id, tray.id));
    expect(await wishlistProductIds(db, b.id)).toEqual([bowl.id]);
  });
});
