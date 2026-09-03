/**
 * Auth-provider switch for the Clerk → Supabase migration.
 *
 * `NEXT_PUBLIC_AUTH_PROVIDER` (readable on both server and client; not a
 * secret) selects which auth stack is live. Default is `clerk` so nothing
 * changes until the cutover — flipping the env var to `supabase` switches the
 * whole app, and flipping back is an instant rollback. Every Supabase code
 * path is built behind this flag.
 */
export type AuthProvider = "clerk" | "supabase";

export function authProvider(): AuthProvider {
  return process.env.NEXT_PUBLIC_AUTH_PROVIDER === "supabase"
    ? "supabase"
    : "clerk";
}

export function isSupabaseAuth(): boolean {
  return authProvider() === "supabase";
}
