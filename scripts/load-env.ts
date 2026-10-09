import { existsSync } from "node:fs";

/**
 * Loads `.env.local` then `.env` for command-line scripts (Next.js does this itself for the
 * app). Values already present in the environment win, so CI and shells can override.
 */
export function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const before = { ...process.env };
    process.loadEnvFile(file);
    for (const [key, value] of Object.entries(before)) process.env[key] = value;
  }
}
