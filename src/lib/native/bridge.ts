"use client";

/**
 * Bridge between the web app and the Athena native (Expo) shell.
 *
 * Every function here is a no-op in a normal browser, so calling them on the
 * web is safe. The shell injects `window.__ATHENA_NATIVE__ = true` before page
 * scripts run and exposes `window.ReactNativeWebView.postMessage`.
 *
 * Why this exists: Google blocks its OAuth consent screen inside embedded
 * WebViews (403 disallowed_useragent), so the shell runs Google sign-in in the
 * system browser and hands the resulting tokens back to the page. See
 * `mobile/src/AthenaWebView.tsx` and `mobile/src/nativeOAuth.ts`.
 */

type NativeMessage = { type: "google-oauth"; next: string };

interface ReactNativeWebViewBridge {
  postMessage: (data: string) => void;
}

declare global {
  interface Window {
    __ATHENA_NATIVE__?: boolean;
    __ATHENA_NATIVE_VERSION__?: string;
    ReactNativeWebView?: ReactNativeWebViewBridge;
    /** Installed by NativeBridge; the shell calls it after a successful sign-in. */
    __athenaSetSession?: (accessToken: string, refreshToken: string, next: string) => void;
    /** Installed by the auth form; the shell calls it on cancel/failure. */
    __athenaOnAuthResult?: (ok: boolean, message: string | null) => void;
  }
}

// Same-origin relative-path guard. Lives in the non-"use client"
// `@/lib/url` so the server auth-callback route can share it; re-exported here
// for the native-shell callers that already import it from this module.
export { isSafeRelativePath } from "@/lib/url";

/** True when the page is running inside the Athena native shell. */
export function isNativeWrapper(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.__ATHENA_NATIVE__ === true ||
    (typeof navigator !== "undefined" && /\bAthenaApp\//.test(navigator.userAgent))
  );
}

/** Post a message to the shell. Returns false if not running in the shell. */
export function postToNative(message: NativeMessage): boolean {
  if (typeof window === "undefined" || !window.ReactNativeWebView) return false;
  window.ReactNativeWebView.postMessage(JSON.stringify(message));
  return true;
}
