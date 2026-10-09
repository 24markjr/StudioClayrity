import "server-only";
import { createDb, type Database } from "./create";

/**
 * App-wide database client (server only). Reused across hot reloads in development so
 * we don't exhaust connections.
 */
const globalForDb = globalThis as unknown as { __scDb?: Database };

function init(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. See .env.example and docs/DATABASE.md.");
  }
  // Serverless functions each hold their own pool — keep it small.
  return createDb(url, { max: process.env.VERCEL ? 3 : 10 }).db;
}

export function getDb(): Database {
  if (!globalForDb.__scDb) globalForDb.__scDb = init();
  return globalForDb.__scDb;
}
