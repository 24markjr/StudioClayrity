import postgres from "postgres";
import { runMigrations } from "../../src/lib/db/migrate";
import { loadLocalEnv } from "../../scripts/load-env";

/**
 * Rebuilds the test database from nothing before the integration suite — which is also
 * the acceptance check that every migration applies cleanly to an empty database.
 */
export default async function setup() {
  loadLocalEnv();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Point it at a disposable Postgres database (see docs/DATABASE.md).",
    );
  }
  const name = new URL(url).pathname.slice(1);
  if (!/test/i.test(name)) {
    throw new Error(`Refusing to reset "${name}": the test database name must contain "test".`);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(`
      DROP SCHEMA IF EXISTS drizzle CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
    `);
  } finally {
    await sql.end();
  }
  await runMigrations(url);
}
