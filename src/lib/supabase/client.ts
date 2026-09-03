import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * Server-only Supabase client using the service-role key.
 *
 * Why service role:
 *  - All callers in this repo are API routes / server modules under `src/lib/db/queries/*`.
 *  - Auth is handled by Clerk (not Supabase Auth), so a per-user JWT pattern doesn't apply.
 *  - The publishable anon key was previously used, which left every public table
 *    readable/writable from the browser (the anon key ships in the JS bundle).
 *  - All public tables now have RLS enabled with default-deny for anon — the service
 *    role key bypasses RLS, so server code keeps working and the anon key has no access.
 *
 * Never import this module from a `"use client"` file. The runtime guard below throws
 * if `window` is defined, but the env var (`SUPABASE_SERVICE_ROLE_KEY`, no NEXT_PUBLIC_)
 * isn't shipped to the browser either, so even without the guard it would crash on use.
 */

let _client: SupabaseClient<Database> | null = null;

function getClient(): SupabaseClient<Database> {
  if (typeof window !== "undefined") {
    throw new Error(
      "[supabase/client.ts] is server-only. Call the matching API route instead of importing this module from a client component."
    );
  }
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
    }
    if (!serviceKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    }
    _client = createClient<Database>(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return _client;
}

export const supabase: SupabaseClient<Database> = new Proxy(
  {} as SupabaseClient<Database>,
  {
    get(_target, prop) {
      return (getClient() as unknown as Record<string | symbol, unknown>)[prop];
    },
  }
);
