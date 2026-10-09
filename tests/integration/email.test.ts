import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { emailDeliveries } from "../../src/lib/db/schema";
import { sendOnce, type EmailMessage, type EmailProvider } from "../../src/lib/services/email";
import { openTestDb } from "./helpers";

const { db } = openTestDb();

const message: EmailMessage = {
  to: "buyer@example.com",
  subject: "Order confirmed",
  html: "<p>Thanks</p>",
  text: "Thanks",
};

function provider(impl?: () => Promise<{ id: string }>) {
  const send = vi.fn(impl ?? (async () => ({ id: `msg-${Math.random()}` })));
  return { provider: { name: "test", send } satisfies EmailProvider, send };
}

describe("sendOnce", () => {
  it("sends once even when a webhook is retried", async () => {
    const { provider: p, send } = provider();
    const results = [];
    for (let i = 0; i < 3; i++)
      results.push(
        await sendOnce(db, p, { dedupeKey: "order:1:confirmation", template: "order-confirmation", message }),
      );
    expect(results).toEqual(["sent", "already_sent", "already_sent"]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends once when five deliveries race", async () => {
    const { provider: p, send } = provider(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { id: "slow" };
    });
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        sendOnce(db, p, { dedupeKey: "order:2:confirmation", template: "t", message }),
      ),
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r === "sent")).toHaveLength(1);
  });

  it("records failures and allows a retry", async () => {
    const failing = provider(async () => {
      throw new Error("Provider down");
    });
    expect(
      await sendOnce(db, failing.provider, { dedupeKey: "order:3:shipped", template: "t", message }),
    ).toBe("failed");

    const [row] = await db
      .select()
      .from(emailDeliveries)
      .where(eq(emailDeliveries.dedupeKey, "order:3:shipped"));
    expect(row).toMatchObject({ status: "failed", error: "Provider down", attempts: 1 });

    const working = provider();
    expect(
      await sendOnce(db, working.provider, { dedupeKey: "order:3:shipped", template: "t", message }),
    ).toBe("sent");
    const [after] = await db
      .select()
      .from(emailDeliveries)
      .where(eq(emailDeliveries.dedupeKey, "order:3:shipped"));
    expect(after).toMatchObject({ status: "sent", attempts: 2 });
  });
});
