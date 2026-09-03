"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { LogOut, User, KeyRound } from "lucide-react";
import { useAuthUser } from "./auth-context";
import { isSupabaseAuth } from "@/lib/auth/provider";

/** Provider-agnostic replacements for Clerk's <SignedIn>/<SignedOut>/
 *  <RedirectToSignIn>/<SignInButton>/<UserButton>. They read the unified
 *  AuthContext, so they work under either provider. */

export function SignedIn({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthUser();
  if (loading || !user) return null;
  return <>{children}</>;
}

export function SignedOut({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthUser();
  if (loading || user) return null;
  return <>{children}</>;
}

/** Client-side redirect to /sign-in (mirrors Clerk's <RedirectToSignIn>).
 *  Render inside <SignedOut> on pages outside the middleware-protected set. */
export function RedirectToSignIn() {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    router.replace(`/sign-in?redirect_url=${encodeURIComponent(pathname)}`);
  }, [router, pathname]);
  return null;
}

/** Navigates to /sign-in (which renders the right UI per provider). Replaces
 *  Clerk's <SignInButton>; `forceRedirectUrl` round-trips back after auth. */
export function SignInButton({
  children,
  forceRedirectUrl,
}: {
  children: React.ReactNode;
  forceRedirectUrl?: string;
  /** Accepted for Clerk API parity; ignored. */
  mode?: string;
  signUpForceRedirectUrl?: string;
}) {
  const router = useRouter();
  const go = () => {
    const target = forceRedirectUrl
      ? `/sign-in?redirect_url=${encodeURIComponent(forceRedirectUrl)}`
      : "/sign-in";
    router.push(target);
  };
  return (
    <span onClick={go} className="contents">
      {children}
    </span>
  );
}

/** Replaces Clerk's <UserButton>: avatar + a small sign-out menu. */
export function AuthUserButton() {
  const { user, signOut } = useAuthUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!user) return null;
  const initial = (user.displayName || user.email || "?").charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border bg-accent text-sm font-medium text-foreground"
        aria-label="Account menu"
      >
        {user.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-lg"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm text-foreground">
            <User size={14} className="shrink-0 text-muted-foreground" />
            <span className="truncate">{user.email || user.displayName}</span>
          </div>
          {isSupabaseAuth() && (
            <a
              href="/account/password"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition hover:bg-accent"
            >
              <KeyRound size={14} />
              Set password
            </a>
          )}
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition hover:bg-accent"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
