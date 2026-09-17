import "server-only";
import { isSupabaseAuth } from "./provider";
import { getUserByAuthId, getUserByClerkId } from "@/lib/db/queries/users";

/**
 * The single "who is the signed-in app user" accessor, provider-aware via the
 * AUTH_PROVIDER flag. Every API route + the protected layout call this, so the
 * Clerk → Supabase cutover is one flag flip: in `clerk` mode it reads Clerk's
 * session, in `supabase` mode the Supabase session — both resolve to the same
 * `public.users` row. Returns null when unauthenticated.
 *
 * Dynamic imports keep the inactive provider's SDK out of the bundle/runtime.
 */
export async function getCurrentUser() {
  const { userId } = await getAuthIdentity();
  return userId ? getAppUser(userId) : null;
}

/**
 * Provider-aware replacement for Clerk's `auth()` at call sites that only
 * need the external auth id. Returns `{ userId }` = the Clerk user id (clerk
 * mode) or the Supabase auth uid (supabase mode), or null. The codemod swaps
 * `await auth()` → `await getAuthIdentity()` so the existing gate lines and
 * error messages stay verbatim (authorization preserved by construction).
 */
export async function getAuthIdentity(): Promise<{ userId: string | null }> {
  if (isSupabaseAuth()) {
    const { getAuthServerClient } = await import("@/lib/supabase/auth-server");
    const supabase = await getAuthServerClient();
    // Rapid concurrent requests (quiz navigation, prefetching) can each
    // reach here and independently call getUser() against the same
    // session/refresh token — Supabase's GoTrue rejects concurrent
    // refresh attempts on the same token and throws. Left unguarded, that
    // exception crashes whatever's calling this (an API route, or the
    // protected layout's server render), which for the layout case
    // produces a broken RSC response and forces Next's router into a full
    // hard reload. Treat a failed check the same as "not authenticated"
    // for this one request rather than taking the request down — a
    // genuinely signed-in user just gets a transient re-check, not a
    // reload that wipes in-progress state (see proxy.ts for the same fix
    // on the middleware's own getUser() call).
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return { userId: user?.id ?? null };
    } catch (err) {
      console.error("[getAuthIdentity] supabase.auth.getUser() failed:", err);
      return { userId: null };
    }
  }
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  return { userId };
}

/** Provider-aware replacement for `getUserByClerkId` — resolves the app user
 *  from whichever external id `getAuthIdentity` returned. */
export async function getAppUser(externalId: string) {
  return isSupabaseAuth()
    ? getUserByAuthId(externalId)
    : getUserByClerkId(externalId);
}
