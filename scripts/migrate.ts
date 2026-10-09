/**
 * Applies pending migrations from ./drizzle. Safe to run repeatedly.
 * Usage: pnpm db:migrate   (uses DATABASE_URL from the environment or .env.local)
 */
import { runMigrations } from "../src/lib/db/migrate";
import { loadLocalEnv } from "./load-env";

loadLocalEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

console.log(`Applying migrations to ${new URL(url).host} …`);
runMigrations(url)
  .then(() => console.log("Migrations applied."))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
