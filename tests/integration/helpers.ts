import { afterAll } from "vitest";
import { loadLocalEnv } from "../../scripts/load-env";
import { createDb } from "../../src/lib/db/create";

loadLocalEnv();

/** One pool per test file, closed automatically when the file finishes. */
export function openTestDb(max = 10) {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const handle = createDb(url, { max });
  afterAll(async () => {
    await handle.sql.end();
  });
  return handle;
}

/** Postgres error code from a failed query (e.g. 23505 unique, 23514 check). */
export function pgCode(error: unknown): string | undefined {
  let current: unknown = error;
  while (current && typeof current === "object") {
    if ("code" in current && typeof current.code === "string" && /^[0-9A-Z]{5}$/.test(current.code)) {
      return current.code;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

export async function expectPgError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    if (pgCode(error) === code) return;
    throw error;
  }
  throw new Error(`Expected Postgres error ${code}, but the query succeeded`);
}
