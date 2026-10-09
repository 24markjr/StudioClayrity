import { z } from "zod";

/**
 * Environment validation. Imported by next.config.ts so a misconfigured
 * deployment fails at build time with a readable message instead of at runtime.
 *
 * Integrations that are not set up yet are optional; the service layer falls back
 * to safe development implementations when their keys are absent. Production
 * requires the core set (see `productionRequired`).
 */

const optional = z.string().trim().min(1).optional();

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "staging", "production"]).default("local"),

  // Database (Supabase Postgres) — Phase 3
  DATABASE_URL: z.url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: optional,

  // Payments (Razorpay) — Phase 6
  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  RAZORPAY_WEBHOOK_SECRET: optional,

  // Email (Resend) — Phase 7
  RESEND_API_KEY: optional,
  EMAIL_FROM: z.email().optional(),
  OWNER_NOTIFICATION_EMAIL: z.email().optional(),

  // Images (Cloudinary) — Phase 3/8
  CLOUDINARY_API_KEY: optional,
  CLOUDINARY_API_SECRET: optional,

  // Shipping (Shiprocket) — Phase 7
  SHIPROCKET_EMAIL: optional,
  SHIPROCKET_PASSWORD: optional,
  SHIPROCKET_WEBHOOK_TOKEN: optional,
  /** Pickup location name exactly as set up in Shiprocket */
  SHIPROCKET_PICKUP_LOCATION: optional,
  SHIPROCKET_PICKUP_PINCODE: z
    .string()
    .regex(/^[1-9][0-9]{5}$/)
    .optional(),

  // Rate limiting (Upstash Redis)
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: optional,

  // Spam protection (Cloudflare Turnstile)
  TURNSTILE_SECRET_KEY: optional,

  // Monitoring (Sentry)
  SENTRY_DSN: z.url().optional(),

  // Show /styleguide in production (pre-launch review only)
  SHOW_STYLEGUIDE: z.enum(["true", "false"]).optional(),

  // Cron endpoints
  CRON_SECRET: optional,
});

const clientSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optional,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: optional,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: optional,
  NEXT_PUBLIC_RAZORPAY_KEY_ID: optional,
});

/** Variables that must exist when APP_ENV=production. Grows as phases land. */
const productionRequired: Array<keyof z.infer<typeof serverSchema> | keyof z.infer<typeof clientSchema>> = [
  "NEXT_PUBLIC_SITE_URL",
];

function emptyToUndefined(source: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, value === "" ? undefined : value]),
  );
}

function formatIssues(error: z.ZodError<unknown>) {
  return error.issues.map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`).join("\n");
}

export function parseEnv(source: Record<string, string | undefined> = process.env) {
  const cleaned = emptyToUndefined(source);
  const server = serverSchema.safeParse(cleaned);
  const client = clientSchema.safeParse(cleaned);

  if (!server.success || !client.success) {
    const issues = [server.error, client.error]
      .flatMap((error) => (error ? [formatIssues(error)] : []))
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }

  const env = { ...server.data, ...client.data };

  if (env.APP_ENV === "production") {
    const missing = productionRequired.filter((key) => cleaned[key] === undefined);
    if (missing.length > 0) {
      throw new Error(
        `Missing environment variables required in production:\n${missing.map((k) => `  • ${k}`).join("\n")}`,
      );
    }
  }

  return env;
}

export type Env = ReturnType<typeof parseEnv>;

export const env: Env = parseEnv();
