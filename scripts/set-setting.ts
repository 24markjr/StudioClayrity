/**
 * Set a store setting from the command line until the admin screens exist (Phase 8).
 * The value is validated against the same schema the admin will use.
 *
 *   pnpm settings:get shipping
 *   pnpm settings:set shipping '{"ratesConfirmed":true,"flatRate":50000,"freeAbove":1500000,"expressRate":null,"chargesGstRateBp":1800}'
 *
 * Amounts are in paise (₹500 = 50000). Run against the right database (DATABASE_URL).
 */
import { createDb } from "../src/lib/db/create";
import { getSetting, setSetting, settingsSchemas, type SettingKey } from "../src/lib/domain/settings";
import { loadLocalEnv } from "./load-env";

async function main() {
  loadLocalEnv();
  const [mode, key, json] = process.argv.slice(2);
  const keys = Object.keys(settingsSchemas) as SettingKey[];
  if (!key || !keys.includes(key as SettingKey) || (mode === "set" && !json)) {
    console.error(
      `Usage: pnpm settings:get <key> | pnpm settings:set <key> '<json>'\nKeys: ${keys.join(", ")}`,
    );
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, sql } = createDb(url, { max: 1 });
  try {
    if (mode === "set") {
      const parsed = settingsSchemas[key as SettingKey].safeParse(JSON.parse(json));
      if (!parsed.success) {
        console.error(parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n"));
        process.exit(1);
      }
      await setSetting(db, key as SettingKey, parsed.data as never);
      console.log(`Saved ${key} on ${new URL(url).host}.`);
    }
    console.log(JSON.stringify(await getSetting(db, key as SettingKey), null, 2));
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
