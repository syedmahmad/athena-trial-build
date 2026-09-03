"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { createAuthBrowserClient } from "@/lib/supabase/auth-browser";

/** Provider-agnostic view of the signed-in user, consumed by the auth shims
 *  (SignedIn/SignedOut/AuthUserButton) and the analytics identifiers. Each
 *  provider populates this same shape, so call sites never branch. */
export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  imageUrl: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthUser(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthUser must be used within <AuthProvider>");
  return ctx;
}

/* ── Clerk bridge (rendered inside <ClerkProvider> in clerk mode) ── */
export function ClerkAuthBridge({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const { signOut } = useAuth();

  const value = useMemo<AuthContextValue>(
    () => ({
      loading: !isLoaded,
      user: user
        ? {
            id: user.id,
            email: user.primaryEmailAddress?.emailAddress ?? "",
            displayName:
              user.fullName?.trim() ||
              user.primaryEmailAddress?.emailAddress?.split("@")[0] ||
              "there",
            imageUrl: user.imageUrl ?? null,
          }
        : null,
      signOut: async () => {
        await signOut({ redirectUrl: "/sign-in" });
      },
    }),
    [user, isLoaded, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ── Supabase session provider (supabase mode) ── */
export function SupabaseAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createAuthBrowserClient(), []);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const map = (u: {
      id: string;
      email?: string;
      user_metadata?: Record<string, unknown>;
    } | null): AuthUser | null => {
      if (!u) return null;
      const email = u.email ?? "";
      const meta = u.user_metadata ?? {};
      return {
        id: u.id,
        email,
        displayName:
          (typeof meta.full_name === "string" && meta.full_name) ||
          (typeof meta.name === "string" && meta.name) ||
          email.split("@")[0] ||
          "there",
        imageUrl:
          typeof meta.avatar_url === "string" ? meta.avatar_url : null,
      };
    };

    // Seed from the locally stored session (cookie-backed, no network round
    // trip) so a cold full-page load resolves the signed-in user immediately.
    // getUser() validates over the network and raced on cold loads, transiently
    // returning null and bouncing client-gated routes (the educators surface).
    // Security gating is server-side (middleware + API getAuthIdentity); the
    // client read is for UI only, so the unvalidated session is fine here.
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setUser(map(data.session?.user ?? null));
        setLoading(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (active) setUser(map(session?.user ?? null));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
        window.location.assign("/sign-in");
      },
    }),
    [user, loading, supabase]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
