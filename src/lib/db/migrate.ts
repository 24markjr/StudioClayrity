import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./create";

/** Applies pending migrations from ./drizzle. Idempotent. */
export async function runMigrations(url: string) {
  const { db, sql } = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
  } finally {
    await sql.end();
  }
}
