"use client";

import { useEffect } from "react";
import { isNativeWrapper, isSafeRelativePath } from "@/lib/native/bridge";
import { createAuthBrowserClient } from "@/lib/supabase/auth-browser";

/**
 * Installs the window hook the Athena native (Expo) shell calls after it
 * completes a system-browser Google sign-in. No-op in a normal browser.
 *
 * The shell runs the OAuth PKCE handshake natively (Google blocks embedded
 * WebViews) and hands us the resulting tokens. We write them into the same
 * cookie-backed session store the email/password flow uses, then hard-navigate
 * so the server picks up the session — identical to the password path.
 *
 * Mounted once in the root layout. Guarded on `isNativeWrapper()`, so it does
 * nothing (and never constructs a Supabase client) for web users.
 */
export function NativeBridge() {
  useEffect(() => {
    if (!isNativeWrapper()) return;

    let supabase: ReturnType<typeof createAuthBrowserClient>;
    try {
      supabase = createAuthBrowserClient();
    } catch {
      return; // Supabase auth env not present (e.g. a Clerk build) — nothing to do.
    }

    window.__athenaSetSession = async (accessToken, refreshToken, next) => {
      try {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          window.__athenaOnAuthResult?.(false, error.message);
          return;
        }
        const dest = isSafeRelativePath(next) ? next : "/dashboard";
        window.location.assign(dest);
      } catch (e) {
        window.__athenaOnAuthResult?.(false, e instanceof Error ? e.message : "Sign-in failed.");
      }
    };

    return () => {
      delete window.__athenaSetSession;
    };
  }, []);

  return null;
}
