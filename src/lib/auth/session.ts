import "server-only";
import { eq, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDb } from "../db/client";
import { profiles } from "../db/schema";
import { AuthError, authorize, hasRole, safeNextPath, type Role, type SessionUser } from "./roles";
import { createSupabaseServerClient, isSupabaseConfigured } from "./supabase";

/**
 * Data Access Layer for the signed-in user. Reads the Supabase session (verified with the
 * Supabase Auth server, not just decoded), then loads the role from our own database —
 * roles are never taken from the cookie or the client.
 *
 * With Cache Components, call these only inside a <Suspense> boundary (they read cookies).
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;

  const db = getDb();
  const email = data.user.email.toLowerCase();
  const columns = { id: profiles.id, email: profiles.email, role: profiles.role };

  const [existing] = await db.select(columns).from(profiles).where(eq(profiles.id, data.user.id));
  if (existing && existing.email === email) return existing;

  // First sign-in creates the profile; an email change in Supabase is synced here.
  const [profile] = await db
    .insert(profiles)
    .values({ id: data.user.id, email })
    .onConflictDoUpdate({ target: profiles.id, set: { email: sql`excluded.email` } })
    .returning(columns);

  return profile;
}

/** For pages: redirect to sign-in when signed out. */
export async function requireUser(nextPath = "/account"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(safeNextPath(nextPath))}`);
  return user;
}

/**
 * For admin pages: signed-out users go to sign-in; signed-in users without the role get a
 * 404, so the admin area's existence isn't confirmed to customers.
 */
export async function requireRole(
  role: Exclude<Role, "customer">,
  nextPath = "/admin",
): Promise<SessionUser> {
  const user = await requireUser(nextPath);
  if (!hasRole(user, role)) notFound();
  return user;
}

/** For route handlers and server actions: throws AuthError (401/403) instead of redirecting. */
export async function authorizeRequest(role: Role = "customer"): Promise<SessionUser> {
  return authorize(await getCurrentUser(), role);
}

/** Convert an AuthError into a JSON response in route handlers. */
export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return Response.json({ error: error.code }, { status: error.status });
  }
  throw error;
}

/** Look up a profile by email (admin tools, scripts). */
export async function findProfileByEmail(email: string) {
  const [row] = await getDb()
    .select()
    .from(profiles)
    .where(eq(sql`lower(${profiles.email})`, email.toLowerCase()));
  return row ?? null;
}
