/**
 * Give a signed-up user the admin (or staff) role.
 *   pnpm admin:grant owner@example.com          → admin
 *   pnpm admin:grant helper@example.com staff   → staff
 *   pnpm admin:grant someone@example.com customer → remove access
 *
 * The person must have signed in once (that creates their profile). Roles are only ever
 * changed here or from the admin — never from the browser.
 */
import { eq, sql } from "drizzle-orm";
import { createDb } from "../src/lib/db/create";
import { auditLogs, profiles } from "../src/lib/db/schema";
import { loadLocalEnv } from "./load-env";

const roles = ["admin", "staff", "customer"] as const;

async function main() {
  loadLocalEnv();
  const [email, roleArg = "admin"] = process.argv.slice(2);
  const role = roles.find((r) => r === roleArg);
  if (!email || !role) {
    console.error("Usage: pnpm admin:grant <email> [admin|staff|customer]");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const { db, sql: client } = createDb(url, { max: 1 });
  try {
    const [profile] = await db
      .update(profiles)
      .set({ role })
      .where(eq(sql`lower(${profiles.email})`, email.toLowerCase()))
      .returning({ id: profiles.id });
    if (!profile) {
      console.error(`No profile for ${email}. Ask them to sign in once, then run this again.`);
      process.exit(1);
    }
    await db
      .insert(auditLogs)
      .values({ action: "role.changed", entity: "profile", entityId: profile.id, diff: { role } });
    console.log(`${email} is now ${role}.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
