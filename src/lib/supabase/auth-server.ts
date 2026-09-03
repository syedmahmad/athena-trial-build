import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

/**
 * Server-side Supabase AUTH client (reads the session from the request
 * cookies). User-scoped, publishable key — distinct from the service-role
 * data client in `client.ts`.
 *
 * Phase 1 of the Clerk → Supabase Auth migration: this reads an existing
 * session; token *rotation* (refresh) is wired into `proxy.ts` in Phase 2.
 * Until the bulk route swap lands, callers still use Clerk's `auth()`; this
 * is the forward path they migrate to.
 */
export async function getAuthServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY are not set"
    );
  }
  const cookieStore = await cookies();
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // In a Server Component the cookie store is read-only; writes throw.
        // That's fine — `proxy.ts` (Phase 2) owns refresh. Swallow so reads
        // from RSCs don't crash.
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          /* read-only context (RSC) — refresh handled in middleware */
        }
      },
    },
  });
}
