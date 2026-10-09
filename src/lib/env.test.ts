import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("accepts an empty local environment with defaults", () => {
    const env = parseEnv({});
    expect(env.APP_ENV).toBe("local");
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
  });

  it("treats empty strings as unset", () => {
    const env = parseEnv({ RAZORPAY_KEY_ID: "" });
    expect(env.RAZORPAY_KEY_ID).toBeUndefined();
  });

  it("rejects malformed values with a readable message", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_SITE_URL: "not-a-url" })).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("requires the production set when APP_ENV=production", () => {
    expect(() => parseEnv({ APP_ENV: "production" })).toThrow(/required in production/);
    expect(() =>
      parseEnv({ APP_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://studioclayrity.com" }),
    ).not.toThrow();
  });
});
