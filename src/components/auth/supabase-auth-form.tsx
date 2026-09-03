"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";
import { createAuthBrowserClient } from "@/lib/supabase/auth-browser";
import { isNativeWrapper, postToNative } from "@/lib/native/bridge";
import { safeRelativePath } from "@/lib/url";

/**
 * Supabase sign-in / sign-up form: magic link + Google OAuth + email/password.
 * Rendered at /sign-in and /sign-up when NEXT_PUBLIC_AUTH_PROVIDER=supabase
 * (Clerk's hosted UI otherwise). Honors `?redirect_url=` so the educator
 * homework share link round-trips back after sign-in.
 */
export function SupabaseAuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const params = useSearchParams();
  // Sanitize at the source so both the post-sign-in `window.location.assign`
  // and the `callbackUrl()` (OAuth redirectTo / magic-link emailRedirectTo)
  // can only ever carry a safe same-origin relative path.
  const next = safeRelativePath(params.get("redirect_url"));
  const supabase = createAuthBrowserClient();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "google" | "magic" | "password" | "reset">(null);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const callbackUrl = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  // In the native shell, the shell drives Google sign-in (system browser) and
  // reports back here so we can clear the spinner / surface errors on cancel.
  useEffect(() => {
    if (!isNativeWrapper()) return;
    window.__athenaOnAuthResult = (ok, message) => {
      if (!ok) {
        setBusy(null);
        if (message) setError(message);
      }
    };
    return () => {
      delete window.__athenaOnAuthResult;
    };
  }, []);

  const google = async () => {
    setError(null);
    setBusy("google");
    // Google blocks its OAuth screen in embedded WebViews; hand off to the
    // native shell, which runs it in the system browser and injects the
    // resulting session (see src/lib/native/bridge.ts).
    if (isNativeWrapper()) {
      if (!postToNative({ type: "google-oauth", next })) {
        setBusy(null);
        setError("Google sign-in is unavailable in this app build.");
      }
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      setError(error.message);
      setBusy(null);
    }
    // success → browser redirects to Google
  };

  const magicLink = async () => {
    if (!email.trim()) return setError("Enter your email first.");
    setError(null);
    setBusy("magic");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: callbackUrl(),
        shouldCreateUser: mode === "sign-up",
        // Carried into raw_user_meta_data when a new user is created, so the
        // signup trigger can seed display_name (parity with Google OAuth).
        data: mode === "sign-up" && name.trim() ? { full_name: name.trim() } : undefined,
      },
    });
    setBusy(null);
    if (error) setError(error.message);
    else setMagicSent(true);
  };

  const withPassword = async () => {
    if (!email.trim() || !password) return setError("Email and password required.");
    setError(null);
    setBusy("password");
    if (mode === "sign-up") {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: callbackUrl(),
          data: name.trim() ? { full_name: name.trim() } : undefined,
        },
      });
      setBusy(null);
      if (error) return setError(error.message);
      // Anti-enumeration: an already-registered email returns success with an
      // empty identities array and sends no email. Nudge instead of dead-ending
      // on a "check your email" screen that never arrives.
      if (data.user && data.user.identities?.length === 0) {
        return setError(
          'That email already has an account. Sign in below, or use "Forgot or set a password" to choose one.'
        );
      }
      setConfirmSent(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setBusy(null);
        setError(error.message);
      } else {
        // Session is in cookies; hard-navigate so the server picks it up.
        window.location.assign(next);
      }
    }
  };

  // Works for any existing account, including magic-link-only users who never
  // set a password — the recovery email lands them on /account/password.
  const resetPassword = async () => {
    if (!email.trim()) return setError("Enter your email first, then tap below.");
    setError(null);
    setBusy("reset");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/account/password`,
    });
    setBusy(null);
    if (error) setError(error.message);
    else setResetSent(true);
  };

  if (magicSent) {
    return (
      <Confirmation
        title="Check your email"
        body={`We sent a sign-in link to ${email}. Open it on this device to continue.`}
      />
    );
  }
  if (resetSent) {
    return (
      <Confirmation
        title="Check your email"
        body={`We sent a link to ${email} to set a new password. Open it to continue.`}
      />
    );
  }
  if (confirmSent) {
    return (
      <Confirmation
        title="Confirm your email"
        body={`We sent a confirmation link to ${email}. Click it, then sign in.`}
      />
    );
  }

  return (
    <div className="w-full max-w-sm space-y-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {mode === "sign-up" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "sign-up"
            ? "Sign up to start learning with Athena."
            : "Sign in to continue."}
        </p>
      </div>

      <button
        onClick={google}
        disabled={!!busy}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-background text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-50"
      >
        {busy === "google" ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <GoogleMark />
        )}
        Continue with Google
      </button>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
      </div>

      {mode === "sign-up" && (
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
          className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      )}
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@school.org"
        autoComplete="email"
        className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
        className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        onClick={withPassword}
        disabled={!!busy}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {busy === "password" && <Loader2 size={16} className="animate-spin" />}
        {mode === "sign-up" ? "Sign up" : "Sign in"}
      </button>

      <button
        onClick={magicLink}
        disabled={!!busy}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-50"
      >
        {busy === "magic" ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Mail size={16} />
        )}
        Email me a sign-in link
      </button>

      {mode === "sign-in" && (
        <button
          onClick={resetPassword}
          disabled={!!busy}
          className="w-full text-center text-sm text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline disabled:opacity-50"
        >
          {busy === "reset" ? "Sending..." : "Forgot or set a password?"}
        </button>
      )}

      <p className="text-center text-sm text-muted-foreground">
        {mode === "sign-up" ? (
          <>
            Already have an account?{" "}
            <Link href="/sign-in" className="text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to Athena?{" "}
            <Link href="/sign-up" className="text-primary underline-offset-4 hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

const Confirmation = ({ title, body }: { title: string; body: string }) => (
  <div className="w-full max-w-sm text-center">
    <CheckCircle2 size={28} className="mx-auto text-emerald-500" />
    <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
      {title}
    </h1>
    <p className="mt-2 text-sm text-muted-foreground">{body}</p>
  </div>
);

const GoogleMark = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
    <path
      fill="#FFC107"
      d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.6 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z"
    />
    <path
      fill="#FF3D00"
      d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.6 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z"
    />
    <path
      fill="#4CAF50"
      d="M24 43.5c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 34.5 26.7 35.5 24 35.5c-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 38.9 16.2 43.5 24 43.5z"
    />
    <path
      fill="#1976D2"
      d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C41.4 36 43.5 30.6 43.5 24c0-1.2-.1-2.3-.4-3.5z"
    />
  </svg>
);
