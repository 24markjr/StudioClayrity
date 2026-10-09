import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { Executor } from "../db/create";
import { inventory, inventoryAdjustments, productVariants, stockReservations } from "../db/schema";

/**
 * Stock operations. Each one locks the inventory row (SELECT … FOR UPDATE) inside the
 * caller's transaction, so two checkouts for the last piece cannot both succeed. The
 * database CHECK constraints are a second line of defence.
 */

export class InsufficientStockError extends Error {
  constructor(
    readonly variantId: string,
    readonly requested: number,
    readonly available: number,
  ) {
    super(`Only ${available} available for variant ${variantId}, requested ${requested}`);
    this.name = "InsufficientStockError";
  }
}

type InventoryReason = (typeof inventoryAdjustments.$inferInsert)["reason"];

async function lockRow(tx: Executor, variantId: string) {
  const [row] = await tx
    .select({ onHand: inventory.onHand, reserved: inventory.reserved })
    .from(inventory)
    .where(eq(inventory.variantId, variantId))
    .for("update");
  return row ?? null;
}

/** Available to sell = on hand − reserved. Untracked (made-to-order) variants are unlimited. */
export async function getAvailability(tx: Executor, variantIds: string[]) {
  if (variantIds.length === 0) return new Map<string, number>();
  const rows = await tx
    .select({
      variantId: productVariants.id,
      track: productVariants.trackInventory,
      onHand: inventory.onHand,
      reserved: inventory.reserved,
    })
    .from(productVariants)
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(inArray(productVariants.id, variantIds));
  return new Map(
    rows.map((r) => [
      r.variantId,
      r.track ? Math.max(0, (r.onHand ?? 0) - (r.reserved ?? 0)) : Number.POSITIVE_INFINITY,
    ]),
  );
}

/**
 * Change stock on hand (restock, damage, manual correction, return) and record why.
 * Refuses to drop on-hand below what is currently reserved.
 */
export async function adjustStock(
  tx: Executor,
  input: {
    variantId: string;
    delta: number;
    reason: InventoryReason;
    reference?: string;
    note?: string;
    actorId?: string | null;
  },
) {
  if (!Number.isInteger(input.delta) || input.delta === 0)
    throw new RangeError("delta must be a non-zero integer");

  let row = await lockRow(tx, input.variantId);
  if (!row) {
    await tx
      .insert(inventory)
      .values({ variantId: input.variantId, onHand: 0, reserved: 0 })
      .onConflictDoNothing();
    row = await lockRow(tx, input.variantId);
    if (!row) throw new Error(`Variant ${input.variantId} not found`);
  }

  const onHandAfter = row.onHand + input.delta;
  if (onHandAfter < row.reserved) {
    throw new InsufficientStockError(input.variantId, -input.delta, row.onHand - row.reserved);
  }

  await tx.update(inventory).set({ onHand: onHandAfter }).where(eq(inventory.variantId, input.variantId));
  await tx.insert(inventoryAdjustments).values({
    variantId: input.variantId,
    delta: input.delta,
    onHandAfter,
    reason: input.reason,
    reference: input.reference,
    note: input.note,
    actorId: input.actorId ?? null,
  });
  return { onHand: onHandAfter, reserved: row.reserved };
}

/**
 * Hold stock for an unpaid order. All-or-nothing: if any line is short, nothing is reserved
 * and InsufficientStockError says which variant. Locks rows in a stable order (by id) so
 * concurrent multi-item checkouts can't deadlock.
 */
export async function reserveStock(
  tx: Executor,
  input: { orderId: string; lines: Array<{ variantId: string; quantity: number }>; expiresAt: Date },
) {
  const lines = [...input.lines].sort((a, b) => a.variantId.localeCompare(b.variantId));
  const tracked = await tx
    .select({ id: productVariants.id, track: productVariants.trackInventory })
    .from(productVariants)
    .where(
      inArray(
        productVariants.id,
        lines.map((l) => l.variantId),
      ),
    );
  const trackById = new Map(tracked.map((t) => [t.id, t.track]));

  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new RangeError("Invalid quantity");
    if (!trackById.has(line.variantId)) throw new Error(`Variant ${line.variantId} not found`);
    if (!trackById.get(line.variantId)) continue; // made to order — nothing to hold

    const row = await lockRow(tx, line.variantId);
    const available = row ? row.onHand - row.reserved : 0;
    if (!row || available < line.quantity) {
      throw new InsufficientStockError(line.variantId, line.quantity, Math.max(0, available));
    }
    await tx
      .update(inventory)
      .set({ reserved: row.reserved + line.quantity })
      .where(eq(inventory.variantId, line.variantId));
    await tx.insert(stockReservations).values({
      orderId: input.orderId,
      variantId: line.variantId,
      quantity: line.quantity,
      expiresAt: input.expiresAt,
    });
  }
}

/** Return reserved stock to the shelf (payment failed, order cancelled, reservation expired). */
export async function releaseReservations(
  tx: Executor,
  orderId: string,
  status: "released" | "expired" = "released",
) {
  const active = await tx
    .select()
    .from(stockReservations)
    .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "active")))
    .orderBy(stockReservations.variantId)
    .for("update");
  for (const reservation of active) {
    await lockRow(tx, reservation.variantId);
    await tx
      .update(inventory)
      .set({ reserved: sql`${inventory.reserved} - ${reservation.quantity}` })
      .where(eq(inventory.variantId, reservation.variantId));
    await tx.update(stockReservations).set({ status }).where(eq(stockReservations.id, reservation.id));
  }
  return active.length;
}

/**
 * Payment confirmed: turn the hold into a sale. Stock leaves on-hand and the movement is
 * recorded. Idempotent — consuming twice does nothing the second time.
 */
export async function consumeReservations(tx: Executor, orderId: string, reference: string) {
  const active = await tx
    .select()
    .from(stockReservations)
    .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "active")))
    .orderBy(stockReservations.variantId)
    .for("update");
  for (const reservation of active) {
    const row = await lockRow(tx, reservation.variantId);
    if (!row) continue;
    const onHandAfter = row.onHand - reservation.quantity;
    await tx
      .update(inventory)
      .set({ onHand: onHandAfter, reserved: row.reserved - reservation.quantity })
      .where(eq(inventory.variantId, reservation.variantId));
    await tx.insert(inventoryAdjustments).values({
      variantId: reservation.variantId,
      delta: -reservation.quantity,
      onHandAfter,
      reason: "sale",
      reference,
    });
    await tx
      .update(stockReservations)
      .set({ status: "consumed" })
      .where(eq(stockReservations.id, reservation.id));
  }
  return active.length;
}

/** Order ids whose holds have lapsed — the cron job releases each in its own transaction. */
export async function findExpiredReservationOrders(tx: Executor, now = new Date()) {
  const rows = await tx
    .selectDistinct({ orderId: stockReservations.orderId })
    .from(stockReservations)
    .where(and(eq(stockReservations.status, "active"), lte(stockReservations.expiresAt, now)));
  return rows.map((r) => r.orderId);
}
