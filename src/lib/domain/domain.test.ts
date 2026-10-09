import { describe, expect, it } from "vitest";
import {
  financialYear,
  formatInvoiceNumber,
  generateOrderRef,
  generateToken,
  hashToken,
  slugify,
  tokenMatchesHash,
} from "./identifiers";
import { isValidGstin, isValidPincode, normaliseIndianMobile, stateName } from "./india";
import {
  ORDER_STATUSES,
  allowedTransitions,
  assertTransition,
  canTransition,
  InvalidTransitionError,
} from "./order-status";

describe("order state machine", () => {
  it("allows the happy path", () => {
    const path = [
      "pending_payment",
      "paid",
      "processing",
      "packed",
      "shipped",
      "out_for_delivery",
      "delivered",
    ] as const;
    for (let i = 1; i < path.length; i++) expect(canTransition(path[i - 1], path[i])).toBe(true);
  });

  it("blocks impossible jumps", () => {
    expect(canTransition("pending_payment", "shipped")).toBe(false);
    expect(canTransition("refunded", "paid")).toBe(false);
    expect(canTransition("delivered", "cancelled")).toBe(false);
    expect(() => assertTransition("pending_payment", "delivered")).toThrow(InvalidTransitionError);
  });

  it("defines transitions for every status and only to known statuses", () => {
    for (const status of ORDER_STATUSES) {
      for (const next of allowedTransitions(status)) expect(ORDER_STATUSES).toContain(next);
    }
  });

  it("makes refunded terminal", () => {
    expect(allowedTransitions("refunded")).toEqual([]);
  });
});

describe("identifiers", () => {
  it("generates unambiguous order references", () => {
    for (let i = 0; i < 200; i++) expect(generateOrderRef()).toMatch(/^SC-[2-9A-HJKMNP-Z]{6}$/);
  });

  it("hashes and verifies tokens", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const hash = hashToken(token);
    expect(hash).toHaveLength(64);
    expect(tokenMatchesHash(token, hash)).toBe(true);
    expect(tokenMatchesHash(`${token}x`, hash)).toBe(false);
  });

  it("slugifies names", () => {
    expect(slugify("Nero Marble Bowl — Large")).toBe("nero-marble-bowl-large");
    expect(slugify("  Café & Crème  ")).toBe("cafe-and-creme");
    expect(slugify("Bianco/Bookends (Pair)")).toBe("bianco-bookends-pair");
  });

  it("computes the Indian financial year in IST", () => {
    expect(financialYear(new Date("2026-10-09T10:00:00Z"))).toBe("26-27");
    expect(financialYear(new Date("2027-02-15T10:00:00Z"))).toBe("26-27");
    // 31 Mar 2027 19:00 UTC = 1 Apr 2027 00:30 IST → new year
    expect(financialYear(new Date("2027-03-31T19:00:00Z"))).toBe("27-28");
    expect(financialYear(new Date("2027-03-31T18:00:00Z"))).toBe("26-27");
  });

  it("formats GST invoice numbers within 16 characters", () => {
    expect(formatInvoiceNumber("26-27", 1)).toBe("SC/26-27/0001");
    expect(formatInvoiceNumber("26-27", 12345)).toBe("SC/26-27/12345");
    expect(() => formatInvoiceNumber("26-27", 0)).toThrow();
  });
});

describe("India helpers", () => {
  it("validates PIN codes", () => {
    expect(isValidPincode("560001")).toBe(true);
    expect(isValidPincode("056001")).toBe(false);
    expect(isValidPincode("56001")).toBe(false);
  });

  it("normalises mobile numbers", () => {
    expect(normaliseIndianMobile("+91 98765 43210")).toBe("9876543210");
    expect(normaliseIndianMobile("09876543210")).toBe("9876543210");
    expect(normaliseIndianMobile("1234567890")).toBeNull();
  });

  it("validates GSTIN structure and checksum", () => {
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin("27AAPFU0939F1ZW")).toBe(false);
    expect(isValidGstin("99AAPFU0939F1ZV")).toBe(false);
  });

  it("names states", () => {
    expect(stateName("29")).toBe("Karnataka");
    expect(stateName("99")).toBeNull();
  });
});
