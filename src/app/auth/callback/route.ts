import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";
import { safeRelativePath } from "@/lib/url";

/**
 * The public origin. Behind the Northflank/envoy reverse proxy, `req.url` is
 * the internal `http://localhost:3000` address, so redirecting to its origin
 * sends users off-site to localhost. Honor the proxy's forwarded headers and
 * fall back to the request origin for local dev (no proxy).
 */
function publicOrigin(req: Request, url: URL): string {
  const host = req.headers.get("x-forwarded-host");
  if (!host) return url.origin;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/**
 * OAuth + magic-link landing. Both flows return here with a `code`; we
 * exchange it for a session and redirect to `next`. Public by nature.
 *
 * IMPORTANT: the session cookies MUST be written onto the response object we
 * return. Writing them via the `next/headers` cookie store (as the RSC-safe
 * `getAuthServerClient` does, swallowing write errors) does NOT attach a
 * `Set-Cookie` to a `NextResponse.redirect(...)` — the browser then lands on
 * `next` with no session, `useAuthUser()` resolves null, and the client bounces
 * back to /sign-in. Password sign-in is unaffected (it writes cookies in the
 * browser), which is why only Google + magic link broke.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = publicOrigin(req, url);
  const code = url.searchParams.get("code");
  // Only allow same-origin relative redirects. `safeRelativePath` rejects
  // protocol-relative (`//evil.com`) and backslash (`/\evil.com`) values that a
  // naive `startsWith("/")` check would let resolve off-origin.
  const dest = safeRelativePath(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/sign-in?error=missing_code", origin));
  }

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!supaUrl || !anonKey) {
    return NextResponse.redirect(new URL("/sign-in?error=auth_misconfigured", origin));
  }

  // Write session cookies onto THIS response so the Set-Cookie reaches the
  // browser along with the redirect.
  const response = NextResponse.redirect(new URL(dest, origin));
  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(supaUrl, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/sign-in?error=${encodeURIComponent(error.message)}`, origin)
    );
  }
  return response;
}
