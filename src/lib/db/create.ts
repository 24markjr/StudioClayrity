import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Creates a Drizzle client. Used by the app (via ./client.ts), scripts and tests.
 * `prepare: false` keeps it compatible with Supabase's transaction pooler (port 6543).
 */
export function createDb(url: string, options: { max?: number } = {}) {
  const sql = postgres(url, {
    prepare: false,
    max: options.max ?? 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // Silence NOTICE messages (e.g. "relation already exists, skipping")
    onnotice: () => {},
  });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

export type Database = ReturnType<typeof createDb>["db"];
/** A database handle or an open transaction — domain functions accept either. */
export type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
