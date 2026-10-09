import { eq, sql } from "drizzle-orm";
import type { Executor } from "../db/create";
import { emailDeliveries } from "../db/schema";
import { IntegrationNotConfiguredError, maskEmail, ProviderError } from "./errors";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Passed to the provider so its own retries are idempotent too */
  idempotencyKey?: string;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ id: string }>;
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage) {
    const response = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        reply_to: message.replyTo,
      }),
      cache: "no-store",
    });
    const body = await response.text();
    if (!response.ok) throw new ProviderError("Resend", response.status, body);
    return { id: (JSON.parse(body) as { id: string }).id };
  }
}

/**
 * Development only: prints a one-line summary instead of sending. Never prints the full
 * recipient address or the message body.
 */
export class DevLogEmailProvider implements EmailProvider {
  readonly name = "dev-log";
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.sent.push(message);
    console.info(`[email:dev] "${message.subject}" → ${maskEmail(message.to)} (not sent)`);
    return { id: `dev-${Date.now()}-${this.sent.length}` };
  }
}

export class UnconfiguredEmailProvider implements EmailProvider {
  readonly name = "unconfigured";
  send(): Promise<{ id: string }> {
    return Promise.reject(new IntegrationNotConfiguredError("Resend (email)"));
  }
}

/**
 * Send a transactional email at most once per `dedupeKey` (e.g. "order:<id>:confirmation").
 * A webhook retried five times still produces one email. Failures are recorded and may be
 * retried by calling again with the same key.
 */
export async function sendOnce(
  db: Executor,
  provider: EmailProvider,
  input: { dedupeKey: string; template: string; message: EmailMessage },
): Promise<"sent" | "already_sent" | "failed"> {
  // Claim the key. If another request already sent it, stop.
  const [claimed] = await db
    .insert(emailDeliveries)
    .values({ dedupeKey: input.dedupeKey, template: input.template, recipient: input.message.to })
    .onConflictDoUpdate({
      target: emailDeliveries.dedupeKey,
      set: { status: "queued", updatedAt: new Date() },
      // Re-claim only after a failure, or if a previous attempt stalled mid-send.
      // An in-flight attempt (queued < 5 min ago) or a sent email is left alone.
      setWhere: sql`${emailDeliveries.status} = 'failed' OR (${emailDeliveries.status} = 'queued' AND ${emailDeliveries.updatedAt} < now() - interval '5 minutes')`,
    })
    .returning({ id: emailDeliveries.id, status: emailDeliveries.status });

  if (!claimed) return "already_sent";

  try {
    const { id } = await provider.send({ ...input.message, idempotencyKey: input.dedupeKey });
    await db
      .update(emailDeliveries)
      .set({
        status: "sent",
        providerMessageId: id,
        error: null,
        attempts: sql`${emailDeliveries.attempts} + 1`,
      })
      .where(eq(emailDeliveries.id, claimed.id));
    return "sent";
  } catch (error) {
    await db
      .update(emailDeliveries)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
        attempts: sql`${emailDeliveries.attempts} + 1`,
      })
      .where(eq(emailDeliveries.id, claimed.id));
    return "failed";
  }
}
