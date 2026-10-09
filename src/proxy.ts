import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before /account and /admin routes:
 *  1. Refreshes the Supabase session cookie so it doesn't silently expire.
 *  2. Optimistically sends signed-out visitors to /login.
 *
 * This is a convenience, not the security boundary — every page, server action and API
 * route re-checks the user and role on the server (src/lib/auth/session.ts).
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const toLogin = () => {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(login);
  };

  // Auth not configured yet: protected areas are unreachable rather than open.
  if (!url || !key) return toLogin();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (!data.user) return toLogin();

  return response;
}

export const config = {
  matcher: ["/account/:path*", "/admin/:path*"],
};
