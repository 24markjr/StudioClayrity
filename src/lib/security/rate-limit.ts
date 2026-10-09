/**
 * Fixed-window rate limiting for public endpoints (order tracking, later sign-in and forms).
 * Uses Upstash Redis when configured — shared across all serverless instances. Without it,
 * falls back to an in-memory window per instance: weaker (each instance counts separately),
 * but still slows down scripted guessing. Production should configure Upstash.
 */

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

export interface RateLimiter {
  check(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

export class MemoryRateLimiter implements RateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  async check(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = this.now();
    let w = this.windows.get(key);
    if (!w || w.resetAt <= now) {
      w = { count: 0, resetAt: now + windowSeconds * 1000 };
      this.windows.set(key, w);
    }
    w.count++;
    if (this.windows.size > 10_000) {
      for (const [k, v] of this.windows) if (v.resetAt <= now) this.windows.delete(k);
    }
    return {
      allowed: w.count <= limit,
      remaining: Math.max(0, limit - w.count),
      retryAfterSeconds: Math.max(0, Math.ceil((w.resetAt - now) / 1000)),
    };
  }
}

export class UpstashRateLimiter implements RateLimiter {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async check(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const redisKey = `rl:${key}`;
    const response = await this.fetchImpl(`${this.url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["EXPIRE", redisKey, String(windowSeconds), "NX"],
        ["TTL", redisKey],
      ]),
      cache: "no-store",
    });
    if (!response.ok) {
      // Never lock customers out because the limiter is down
      return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
    }
    const [incr, , ttl] = (await response.json()) as Array<{ result: number }>;
    const count = Number(incr.result);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: Math.max(0, Number(ttl.result)),
    };
  }
}

let shared: RateLimiter | undefined;

export function getRateLimiter(env: Record<string, string | undefined> = process.env): RateLimiter {
  shared ??=
    env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
      ? new UpstashRateLimiter(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN)
      : new MemoryRateLimiter();
  return shared;
}

/** Best-effort client identifier from proxy headers (Vercel sets x-forwarded-for). */
export function clientKey(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
