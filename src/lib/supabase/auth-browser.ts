"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

/**
 * Browser-side Supabase client for AUTH (sign-in/up, session, sign-out).
 *
 * Uses the publishable (anon) key — NOT the service role. This is the
 * user-scoped client; it carries the signed-in user's JWT. Distinct from the
 * server-only service-role client in `client.ts`, which is for data access
 * and bypasses RLS. (Phase 1 of the Clerk → Supabase Auth migration; coexists
 * with Clerk until cutover.)
 *
 * Module-level singleton: every caller shares one `GoTrueClient` instance
 * per browser tab. Each `createBrowserClient()` call spins up its own
 * auto-refresh timer against the same session; without a singleton, a
 * remounting provider (Fast Refresh, layout churn) or an un-memoized call
 * site leaks a live timer on every mount (unsubscribing the auth-state
 * listener on unmount does not stop it), and the resulting concurrent
 * refreshes throw `AuthApiError: Too many concurrent token refresh
 * requests` and orphaned `lock:sb-*-auth-token` warnings.
 */
let _authClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createAuthBrowserClient() {
  if (_authClient) return _authClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY are not set"
    );
  }
  _authClient = createBrowserClient<Database>(url, anonKey);
  return _authClient;
}
