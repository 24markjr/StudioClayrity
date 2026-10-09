import { defineConfig } from "drizzle-kit";
import { loadLocalEnv } from "./scripts/load-env";

loadLocalEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/studioclayrity",
  },
  strict: true,
  verbose: true,
});
