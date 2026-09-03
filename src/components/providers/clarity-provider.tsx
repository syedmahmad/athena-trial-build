"use client";
import { useAuthUser } from "@/components/auth/auth-context";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Identifies the current user to Microsoft Clarity per their Identify
 * API guidance:
 *   https://learn.microsoft.com/en-us/clarity/setup-and-installation/identify-api
 *
 * - `custom-id`        = email (hashed client-side by Clarity before
 *   transmit; becomes the primary filter in the Clarity dashboard)
 * - `custom-session-id` = Clerk session id, so a Clarity session can be
 *   correlated with the auth session it ran under
 * - `custom-page-id`   = current pathname for per-page filtering
 * - `friendly-name`    = displayName (or email local-part fallback) so
 *   the dashboard surfaces a readable label instead of the hash
 *
 * Re-fires on every route change because Clarity recommends calling
 * Identify on each page of the site.
 */
export function ClarityIdentifier() {
  const { user, loading } = useAuthUser();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || !user) return;
    if (typeof window === "undefined" || !window.clarity) return;
    if (!user.email) return;

    window.clarity(
      "identify",
      user.email,
      "", // auth session id — not threaded through the unified context
      pathname || "",
      user.displayName,
    );
  }, [user, loading, pathname]);

  return null;
}
