import { describe, expect, it, vi } from "vitest";
import { clientKey, MemoryRateLimiter, UpstashRateLimiter } from "./rate-limit";

describe("MemoryRateLimiter", () => {
  it("allows up to the limit per window, then blocks until the window resets", async () => {
    let now = 0;
    const limiter = new MemoryRateLimiter(() => now);
    for (let i = 0; i < 3; i++) expect((await limiter.check("ip", 3, 60)).allowed).toBe(true);
    const blocked = await limiter.check("ip", 3, 60);
    expect(blocked).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    expect((await limiter.check("other-ip", 3, 60)).allowed).toBe(true);
    now = 61_000;
    expect((await limiter.check("ip", 3, 60)).allowed).toBe(true);
  });
});

describe("UpstashRateLimiter", () => {
  it("counts with INCR/EXPIRE in one pipeline", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json([{ result: 6 }, { result: 0 }, { result: 42 }]),
    );
    const limiter = new UpstashRateLimiter("https://redis.example", "tok", fetchImpl);
    expect(await limiter.check("ip", 5, 60)).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 42 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://redis.example/pipeline");
    expect(JSON.parse(String(init?.body))[0]).toEqual(["INCR", "rl:ip"]);
  });

  it("fails open if Redis is unavailable", async () => {
    const limiter = new UpstashRateLimiter(
      "https://redis.example",
      "tok",
      async () => new Response("down", { status: 500 }),
    );
    expect((await limiter.check("ip", 5, 60)).allowed).toBe(true);
  });
});

describe("clientKey", () => {
  it("uses the first forwarded address", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientKey(new Headers())).toBe("unknown");
  });
});
