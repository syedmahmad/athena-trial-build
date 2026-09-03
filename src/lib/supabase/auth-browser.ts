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
 */
export function createAuthBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY are not set"
    );
  }
  return createBrowserClient<Database>(url, anonKey);
}
