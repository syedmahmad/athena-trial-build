"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, CheckCircle2, KeyRound } from "lucide-react";
import { createAuthBrowserClient } from "@/lib/supabase/auth-browser";

/**
 * Set or change a password. Two ways here:
 *  - A "Forgot or set a password" recovery link from the sign-in form, which
 *    /auth/callback exchanges into a (recovery) session, then redirects here.
 *  - A signed-in user choosing "Set password" from the account menu.
 * Either way there's a session, so `updateUser({ password })` applies it. This
 * is what lets magic-link-only users (who never had a password) set one.
 */
export default function SetPasswordPage() {
  const supabase = createAuthBrowserClient();
  const [state, setState] = useState<"loading" | "authed" | "anon">("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setState(data.user ? "authed" : "anon"));
  }, [supabase]);

  const submit = async () => {
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(true);
    // Hard-navigate so the server picks up the (already-current) session.
    setTimeout(() => window.location.assign("/dashboard"), 1200);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      {state === "loading" ? (
        <Loader2 className="animate-spin text-muted-foreground" />
      ) : done ? (
        <div className="w-full max-w-sm text-center">
          <CheckCircle2 size={28} className="mx-auto text-emerald-500" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
            Password set
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Taking you to your dashboard.
          </p>
        </div>
      ) : state === "anon" ? (
        <div className="w-full max-w-sm text-center">
          <KeyRound size={26} className="mx-auto text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
            Set a password
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link has expired or you are signed out. Request a fresh link
            from the sign-in page.
          </p>
          <Link
            href="/sign-in"
            className="mt-4 inline-block text-sm text-primary underline-offset-4 hover:underline"
          >
            Go to sign in
          </Link>
        </div>
      ) : (
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Set your password
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a password you can use to sign in next time.
            </p>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            autoComplete="new-password"
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm password"
            autoComplete="new-password"
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            onClick={submit}
            disabled={busy}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            Save password
          </button>
        </div>
      )}
    </div>
  );
}
