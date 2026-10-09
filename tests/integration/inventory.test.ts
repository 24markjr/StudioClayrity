import { eq, inArray, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seed } from "../../scripts/seed";
import {
  inventory,
  inventoryAdjustments,
  invoiceSequences,
  orders,
  productVariants,
  stockReservations,
} from "../../src/lib/db/schema";
import { generateOrderRef } from "../../src/lib/domain/identifiers";
import {
  adjustStock,
  consumeReservations,
  findExpiredReservationOrders,
  getAvailability,
  InsufficientStockError,
  releaseReservations,
  reserveStock,
} from "../../src/lib/domain/inventory";
import { nextInvoiceNumber } from "../../src/lib/domain/invoices";
import { openTestDb } from "./helpers";

const { db } = openTestDb(20);

const address = {
  fullName: "Test",
  phone: "9876543210",
  line1: "1 Road",
  city: "Bengaluru",
  stateCode: "29",
  pincode: "560001",
  country: "IN",
};

async function createTestOrder() {
  const [order] = await db
    .insert(orders)
    .values({
      publicRef: generateOrderRef(8),
      accessTokenHash: "test",
      email: "test@example.com",
      phone: "9876543210",
      sellerStateCode: "29",
      shippingAddress: address,
      billingAddress: address,
      subtotal: 100,
      total: 100,
      isTest: true,
    })
    .returning({ id: orders.id, publicRef: orders.publicRef });
  return order;
}

async function variantBySku(sku: string) {
  const [v] = await db.select().from(productVariants).where(eq(productVariants.sku, sku));
  return v;
}

async function stockOf(variantId: string) {
  const [row] = await db.select().from(inventory).where(eq(inventory.variantId, variantId));
  return row;
}

beforeAll(async () => {
  await seed(db, { appEnv: "test" });
});

beforeEach(async () => {
  // Fresh stock for every test
  await db.delete(stockReservations);
  await db.delete(orders);
  const unique = await variantBySku("SAMPLE-BOWL-001");
  await db.update(inventory).set({ onHand: 1, reserved: 0 }).where(eq(inventory.variantId, unique.id));
  const tray = await variantBySku("SAMPLE-TRAY-001-L");
  await db.update(inventory).set({ onHand: 4, reserved: 0 }).where(eq(inventory.variantId, tray.id));
});

describe("reservations", () => {
  it("reserve → consume turns a hold into a sale with a history entry", async () => {
    const tray = await variantBySku("SAMPLE-TRAY-001-L");
    const order = await createTestOrder();
    await db.transaction((tx) =>
      reserveStock(tx, {
        orderId: order.id,
        lines: [{ variantId: tray.id, quantity: 3 }],
        expiresAt: new Date(Date.now() + 900_000),
      }),
    );
    expect(await stockOf(tray.id)).toMatchObject({ onHand: 4, reserved: 3 });
    expect((await getAvailability(db, [tray.id])).get(tray.id)).toBe(1);

    await db.transaction((tx) => consumeReservations(tx, order.id, order.publicRef));
    expect(await stockOf(tray.id)).toMatchObject({ onHand: 1, reserved: 0 });
    const history = await db
      .select()
      .from(inventoryAdjustments)
      .where(eq(inventoryAdjustments.reference, order.publicRef));
    expect(history).toMatchObject([{ delta: -3, onHandAfter: 1, reason: "sale" }]);

    // Idempotent: a duplicate webhook consuming again changes nothing
    expect(await db.transaction((tx) => consumeReservations(tx, order.id, order.publicRef))).toBe(0);
    expect(await stockOf(tray.id)).toMatchObject({ onHand: 1, reserved: 0 });
  });

  it("release returns stock to the shelf", async () => {
    const tray = await variantBySku("SAMPLE-TRAY-001-L");
    const order = await createTestOrder();
    await db.transaction((tx) =>
      reserveStock(tx, {
        orderId: order.id,
        lines: [{ variantId: tray.id, quantity: 2 }],
        expiresAt: new Date(Date.now() + 900_000),
      }),
    );
    await db.transaction((tx) => releaseReservations(tx, order.id));
    expect(await stockOf(tray.id)).toMatchObject({ onHand: 4, reserved: 0 });
  });

  it("is all-or-nothing across lines", async () => {
    const tray = await variantBySku("SAMPLE-TRAY-001-L");
    const unique = await variantBySku("SAMPLE-BOWL-001");
    const order = await createTestOrder();
    await expect(
      db.transaction((tx) =>
        reserveStock(tx, {
          orderId: order.id,
          lines: [
            { variantId: tray.id, quantity: 1 },
            { variantId: unique.id, quantity: 2 },
          ],
          expiresAt: new Date(Date.now() + 900_000),
        }),
      ),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await stockOf(tray.id)).toMatchObject({ reserved: 0 });
    expect(await stockOf(unique.id)).toMatchObject({ reserved: 0 });
  });

  it("never holds stock for made-to-order pieces", async () => {
    const mto = await variantBySku("SAMPLE-VASE-001");
    const order = await createTestOrder();
    await db.transaction((tx) =>
      reserveStock(tx, {
        orderId: order.id,
        lines: [{ variantId: mto.id, quantity: 2 }],
        expiresAt: new Date(Date.now() + 900_000),
      }),
    );
    expect((await getAvailability(db, [mto.id])).get(mto.id)).toBe(Number.POSITIVE_INFINITY);
  });

  it("finds expired holds", async () => {
    const tray = await variantBySku("SAMPLE-TRAY-001-L");
    const order = await createTestOrder();
    await db.transaction((tx) =>
      reserveStock(tx, {
        orderId: order.id,
        lines: [{ variantId: tray.id, quantity: 1 }],
        expiresAt: new Date(Date.now() - 1000),
      }),
    );
    expect(await findExpiredReservationOrders(db)).toContain(order.id);
    await db.transaction((tx) => releaseReservations(tx, order.id, "expired"));
    expect(await findExpiredReservationOrders(db)).not.toContain(order.id);
  });
});

describe("concurrency", () => {
  it("sells a one-of-a-kind piece exactly once when 10 buyers check out at the same moment", async () => {
    const unique = await variantBySku("SAMPLE-BOWL-001");
    const buyers = await Promise.all(Array.from({ length: 10 }, () => createTestOrder()));

    const results = await Promise.allSettled(
      buyers.map((order) =>
        db.transaction((tx) =>
          reserveStock(tx, {
            orderId: order.id,
            lines: [{ variantId: unique.id, quantity: 1 }],
            expiresAt: new Date(Date.now() + 900_000),
          }),
        ),
      ),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(9);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(InsufficientStockError);
    expect(await stockOf(unique.id)).toMatchObject({ onHand: 1, reserved: 1 });
  });

  it("makes a second buyer wait for the first and then refuses them (guaranteed overlap)", async () => {
    const unique = await variantBySku("SAMPLE-BOWL-001");
    const [first, second] = await Promise.all([createTestOrder(), createTestOrder()]);
    const expiresAt = new Date(Date.now() + 900_000);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Buyer 1 reserves, then keeps its transaction open for 300ms before committing
    const buyer1 = db.transaction(async (tx) => {
      await reserveStock(tx, {
        orderId: first.id,
        lines: [{ variantId: unique.id, quantity: 1 }],
        expiresAt,
      });
      await sleep(300);
    });
    // Buyer 2 starts while buyer 1's transaction is still open
    await sleep(100);
    const buyer2 = db.transaction((tx) =>
      reserveStock(tx, { orderId: second.id, lines: [{ variantId: unique.id, quantity: 1 }], expiresAt }),
    );

    const [r1, r2] = await Promise.allSettled([buyer1, buyer2]);
    expect(r1.status).toBe("fulfilled");
    expect(r2.status).toBe("rejected");
    expect((r2 as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientStockError);
    expect(await stockOf(unique.id)).toMatchObject({ onHand: 1, reserved: 1 });
  });

  it("does not deadlock when two baskets lock the same items in different orders", async () => {
    const tray = await variantBySku("SAMPLE-TRAY-001-L");
    const coasters = await variantBySku("SAMPLE-CSTR-001");
    const [a, b] = await Promise.all([createTestOrder(), createTestOrder()]);
    const expiresAt = new Date(Date.now() + 900_000);
    await Promise.all([
      db.transaction((tx) =>
        reserveStock(tx, {
          orderId: a.id,
          expiresAt,
          lines: [
            { variantId: tray.id, quantity: 1 },
            { variantId: coasters.id, quantity: 1 },
          ],
        }),
      ),
      db.transaction((tx) =>
        reserveStock(tx, {
          orderId: b.id,
          expiresAt,
          lines: [
            { variantId: coasters.id, quantity: 1 },
            { variantId: tray.id, quantity: 1 },
          ],
        }),
      ),
    ]);
    expect(await stockOf(tray.id)).toMatchObject({ reserved: 2 });
  });

  it("issues gap-free, unique invoice numbers under concurrent payments", async () => {
    await db.delete(invoiceSequences);
    const date = new Date("2026-10-09T10:00:00Z");
    const numbers = await Promise.all(
      Array.from({ length: 25 }, () => db.transaction((tx) => nextInvoiceNumber(tx, date))),
    );
    const sorted = [...numbers].sort();
    expect(new Set(numbers).size).toBe(25);
    expect(sorted[0]).toBe("SC/26-27/0001");
    expect(sorted[24]).toBe("SC/26-27/0025");
  });

  it("does not burn an invoice number when the transaction rolls back", async () => {
    await db.delete(invoiceSequences);
    const date = new Date("2026-10-09T10:00:00Z");
    await db
      .transaction(async (tx) => {
        await nextInvoiceNumber(tx, date);
        throw new Error("payment processing failed");
      })
      .catch(() => {});
    expect(await db.transaction((tx) => nextInvoiceNumber(tx, date))).toBe("SC/26-27/0001");
  });
});

describe("stock adjustments", () => {
  it("records restocks and refuses to go below reserved stock", async () => {
    const tray = await variantBySku("SAMPLE-TRAY-001-L");
    await db.transaction((tx) =>
      adjustStock(tx, { variantId: tray.id, delta: 6, reason: "restock", note: "New batch" }),
    );
    expect(await stockOf(tray.id)).toMatchObject({ onHand: 10 });

    const order = await createTestOrder();
    await db.transaction((tx) =>
      reserveStock(tx, {
        orderId: order.id,
        lines: [{ variantId: tray.id, quantity: 8 }],
        expiresAt: new Date(Date.now() + 900_000),
      }),
    );
    await expect(
      db.transaction((tx) => adjustStock(tx, { variantId: tray.id, delta: -3, reason: "damage" })),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    const history = await db
      .select({ reason: inventoryAdjustments.reason })
      .from(inventoryAdjustments)
      .where(inArray(inventoryAdjustments.variantId, [tray.id]));
    expect(history.map((h) => h.reason)).toContain("restock");
    expect(history.map((h) => h.reason)).not.toContain("damage");
  });

  it("rejects zero adjustments", async () => {
    const tray = await variantBySku("SAMPLE-TRAY-001-L");
    await expect(
      db.transaction((tx) => adjustStock(tx, { variantId: tray.id, delta: 0, reason: "manual" })),
    ).rejects.toThrow(RangeError);
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(inventoryAdjustments)
      .where(eq(inventoryAdjustments.delta, 0));
    expect(total).toBe(0);
  });
});
