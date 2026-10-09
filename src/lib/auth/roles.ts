/**
 * Roles and authorisation rules — no framework code, so it is unit-tested directly and
 * reused by pages, server actions and API routes alike.
 */

export type Role = "customer" | "staff" | "admin";

export type SessionUser = {
  id: string;
  email: string;
  role: Role;
};

const rank: Record<Role, number> = { customer: 0, staff: 1, admin: 2 };

/** admin ⊃ staff ⊃ customer */
export function hasRole(user: Pick<SessionUser, "role"> | null | undefined, required: Role) {
  return !!user && rank[user.role] >= rank[required];
}

export class AuthError extends Error {
  constructor(readonly code: "unauthenticated" | "forbidden") {
    super(code === "unauthenticated" ? "Sign in required" : "You don't have access to this");
    this.name = "AuthError";
  }

  get status() {
    return this.code === "unauthenticated" ? 401 : 403;
  }
}

/** Throws AuthError unless `user` is signed in with at least `required`. */
export function authorize(user: SessionUser | null | undefined, required: Role): SessionUser {
  if (!user) throw new AuthError("unauthenticated");
  if (!hasRole(user, required)) throw new AuthError("forbidden");
  return user;
}

/**
 * True when `user` may read a record owned by `ownerId`. Staff and admins can read any
 * customer record; customers only their own. Used for orders, addresses and returns.
 */
export function canAccessOwnedRecord(user: SessionUser | null | undefined, ownerId: string | null) {
  if (!user) return false;
  if (hasRole(user, "staff")) return true;
  return ownerId !== null && ownerId === user.id;
}

/** Only allow same-site relative redirects after sign-in (prevents open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/account") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
