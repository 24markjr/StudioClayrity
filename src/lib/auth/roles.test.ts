import { describe, expect, it } from "vitest";
import { AuthError, authorize, canAccessOwnedRecord, hasRole, safeNextPath, type SessionUser } from "./roles";

const customer: SessionUser = { id: "u1", email: "a@example.com", role: "customer" };
const otherCustomer: SessionUser = { id: "u2", email: "b@example.com", role: "customer" };
const staff: SessionUser = { id: "s1", email: "s@example.com", role: "staff" };
const admin: SessionUser = { id: "a1", email: "o@example.com", role: "admin" };

describe("role guards", () => {
  it("ranks admin above staff above customer", () => {
    expect(hasRole(admin, "staff")).toBe(true);
    expect(hasRole(staff, "admin")).toBe(false);
    expect(hasRole(customer, "customer")).toBe(true);
    expect(hasRole(null, "customer")).toBe(false);
  });

  it("rejects anonymous users with 401", () => {
    const error = (() => {
      try {
        authorize(null, "customer");
      } catch (e) {
        return e as AuthError;
      }
    })();
    expect(error).toBeInstanceOf(AuthError);
    expect(error?.status).toBe(401);
  });

  it("rejects insufficient roles with 403", () => {
    expect(() => authorize(customer, "admin")).toThrow(AuthError);
    try {
      authorize(staff, "admin");
    } catch (e) {
      expect((e as AuthError).status).toBe(403);
    }
  });

  it("returns the user when allowed", () => {
    expect(authorize(admin, "admin")).toBe(admin);
  });
});

describe("record ownership", () => {
  it("lets customers see only their own records", () => {
    expect(canAccessOwnedRecord(customer, "u1")).toBe(true);
    expect(canAccessOwnedRecord(otherCustomer, "u1")).toBe(false);
    expect(canAccessOwnedRecord(customer, null)).toBe(false);
    expect(canAccessOwnedRecord(null, "u1")).toBe(false);
  });

  it("lets staff and admins see any record", () => {
    expect(canAccessOwnedRecord(staff, "u1")).toBe(true);
    expect(canAccessOwnedRecord(admin, null)).toBe(true);
  });
});

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/account/orders?page=2")).toBe("/account/orders?page=2");
  });

  it("blocks external and protocol-relative redirects", () => {
    expect(safeNextPath("https://evil.example")).toBe("/account");
    expect(safeNextPath("//evil.example")).toBe("/account");
    expect(safeNextPath("/\\evil.example")).toBe("/account");
    expect(safeNextPath(undefined, "/")).toBe("/");
  });
});
