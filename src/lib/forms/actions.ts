"use server";

import { z } from "zod";
import { getDb } from "../db/client";
import { backInStockRequests, newsletterSubscribers, productVariants } from "../db/schema";
import { generateToken } from "../domain/identifiers";
import { eq } from "drizzle-orm";

/**
 * Public form submissions. Every input is validated on the server; responses never reveal
 * whether an email was already known. A hidden "website" field catches simple bots
 * (Turnstile and rate limiting are added when their keys exist).
 */

export type FormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Submitted values, so fields keep what the person typed after a validation error */
  values?: Record<string, string>;
};

function submitted(formData: FormData, ...keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "").slice(0, 300)]));
}

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: "Enter a valid email address." }));

function isBot(formData: FormData) {
  return Boolean(formData.get("website"));
}

const newsletterSchema = z.object({
  email,
  consent: z.literal("on", { message: "Please tick the box to agree to receive emails." }),
  source: z.string().max(40).optional(),
});

export async function subscribeToNewsletter(_prev: FormState, formData: FormData): Promise<FormState> {
  const success: FormState = { status: "success", message: "Thank you — you're on the list." };
  if (isBot(formData)) return success;

  const parsed = newsletterSchema.safeParse({
    email: formData.get("email"),
    consent: formData.get("consent") ?? undefined,
    source: formData.get("source") ?? undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { status: "error", fieldErrors, values: submitted(formData, "email", "consent") };
  }

  try {
    await getDb()
      .insert(newsletterSubscribers)
      .values({
        email: parsed.data.email,
        status: "subscribed",
        source: parsed.data.source ?? "website",
        consentAt: new Date(),
        unsubscribeToken: generateToken(24),
      })
      .onConflictDoNothing();
    return success;
  } catch {
    return {
      status: "error",
      message: "We couldn't save that just now. Please try again.",
      values: submitted(formData, "email"),
    };
  }
}

const notifySchema = z.object({ email, variantId: z.uuid() });

export async function requestBackInStock(_prev: FormState, formData: FormData): Promise<FormState> {
  const success: FormState = { status: "success", message: "We'll email you if it becomes available." };
  if (isBot(formData)) return success;

  const parsed = notifySchema.safeParse({
    email: formData.get("email"),
    variantId: formData.get("variantId"),
  });
  if (!parsed.success) {
    const emailIssue = parsed.error.issues.find((i) => i.path[0] === "email");
    return emailIssue
      ? { status: "error", fieldErrors: { email: emailIssue.message }, values: submitted(formData, "email") }
      : { status: "error", message: "Something went wrong. Please refresh and try again." };
  }

  try {
    const db = getDb();
    const [variant] = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.id, parsed.data.variantId));
    if (!variant) return { status: "error", message: "This piece is no longer listed." };
    await db
      .insert(backInStockRequests)
      .values({ variantId: variant.id, email: parsed.data.email })
      .onConflictDoNothing();
    return success;
  } catch {
    return {
      status: "error",
      message: "We couldn't save that just now. Please try again.",
      values: submitted(formData, "email"),
    };
  }
}
