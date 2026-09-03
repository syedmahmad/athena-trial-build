"use client";
import { useAuthUser } from "@/components/auth/auth-context";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Associates the signed-in user with their Umami session via the tracker's
 * identify() API: https://docs.umami.is/docs/tracker-functions
 *
 *   umami.identify(<clerk user id>, { email, name })
 *
 * - unique id  = Clerk user id (stable across sessions + devices)
 * - properties = email + name, surfaced in the Umami visitor profile and
 *   usable as segment filters
 *
 * No-ops until the tracker script has loaded (window.umami present) and a
 * user is signed in. Re-fires on route change so a session that begins
 * signed-out and later authenticates still gets identified. Renders nothing.
 */
export function UmamiIdentifier() {
  const { user, loading } = useAuthUser();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || !user) return;
    if (typeof window === "undefined") return;
    const { umami } = window;
    if (!umami) return;

    umami.identify(user.id, { email: user.email, name: user.displayName });
  }, [user, loading, pathname]);

  return null;
}
