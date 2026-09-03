/**
 * Runtime configuration for the Athena native shell.
 *
 * Values come from `EXPO_PUBLIC_*` env vars (inlined at build time by Expo).
 * Copy `.env.example` to `.env` and fill them in for local development; set
 * them as EAS build env / secrets for real builds.
 */

/** Production web app the shell wraps. */
const PROD_WEB_URL = "https://athena.sset.dev";

/**
 * The web app URL loaded in the WebView.
 *
 * For a dev build pointed at your local Next.js server, set
 * `EXPO_PUBLIC_WEB_URL` to your machine's LAN address (a real device cannot
 * reach `localhost`), e.g. `EXPO_PUBLIC_WEB_URL=http://192.168.1.20:3001`.
 */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || "").trim() || PROD_WEB_URL;

/**
 * Supabase project values, used ONLY for the native Google-OAuth round-trip
 * (Google blocks its OAuth consent screen inside embedded WebViews). Mirror the
 * web app's public values:
 *   NEXT_PUBLIC_SUPABASE_URL                     -> EXPO_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY -> EXPO_PUBLIC_SUPABASE_ANON_KEY
 * These are publishable (anon) values, safe to ship in the client bundle.
 */
export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || "").trim();
export const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "").trim();

/** True when the native Google sign-in path can run. */
export const hasNativeAuthConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Appended to the WebView User-Agent so the web app can detect the shell. */
export const APP_UA_TAG = "AthenaApp/1.0";
