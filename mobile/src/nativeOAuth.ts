import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

// Ensures the in-app browser dismisses and hands control back after the
// redirect. Safe to call unconditionally at module load.
WebBrowser.maybeCompleteAuthSession();

/**
 * A Supabase client used ONLY to drive the Google OAuth PKCE handshake in the
 * system browser. The resulting tokens are handed to the WebView, which is the
 * real session owner.
 *
 * `persistSession: false` so we never write the returned session to disk (the
 * WebView's cookie store owns it). `storage` is still provided because the PKCE
 * code verifier is written there during signInWithOAuth and read back during
 * exchangeCodeForSession — that is independent of persistSession.
 */
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    flowType: "pkce",
    detectSessionInUrl: false,
    persistSession: false,
    autoRefreshToken: false,
  },
});

export type OAuthResult =
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; canceled?: boolean; message?: string };

function paramString(value: string | (string | null)[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

/**
 * Runs Google sign-in in the system browser (ASWebAuthenticationSession /
 * Chrome Custom Tabs) — the only place Google permits its OAuth screen — and
 * exchanges the returned code for a session via PKCE.
 */
export async function signInWithGoogleNative(): Promise<OAuthResult> {
  // athena://auth-callback — must be allow-listed in Supabase Auth → URL
  // Configuration → Redirect URLs.
  const redirectTo = Linking.createURL("auth-callback");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data?.url) {
    return { ok: false, message: error?.message ?? "Could not start Google sign-in." };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === "cancel" || result.type === "dismiss") {
    return { ok: false, canceled: true };
  }
  if (result.type !== "success") {
    return { ok: false, message: "Sign-in did not complete." };
  }

  const { queryParams } = Linking.parse(result.url);
  const code = paramString(queryParams?.code);
  const errorDescription = paramString(queryParams?.error_description);
  if (!code) {
    return { ok: false, message: errorDescription ?? "No authorization code returned." };
  }

  const { data: sessionData, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !sessionData?.session) {
    return { ok: false, message: exchangeError?.message ?? "Could not complete sign-in." };
  }

  // Hand the tokens to the WebView. Do NOT sign out here — `signOut({scope})`
  // hits GoTrue's /logout and revokes this very refresh token server-side,
  // which would silently kill the WebView session at its first refresh.
  return {
    ok: true,
    accessToken: sessionData.session.access_token,
    refreshToken: sessionData.session.refresh_token,
  };
}
