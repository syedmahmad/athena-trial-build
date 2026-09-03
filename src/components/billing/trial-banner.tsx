"use client";

import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useStartCheckout } from "@/hooks/use-billing";

/**
 * Slim floating pill that tells a direct learner their free trial is counting
 * down and offers a one-click path to subscribe. Renders for nobody else:
 *   - paid / grandfathered (learningAccess === true) → no banner
 *   - homework-funnel students (false) → no banner
 *   - learners with no trial window (null trialEndsAt = grandfathered) → none
 *   - expired trials → none here (the (protected) layout swaps in LearningUpsell)
 *
 * Dismiss hides it for the browser session only, so it returns on the next
 * visit and keeps nudging as the deadline approaches.
 */
const DISMISS_KEY = "athena_trial_banner_dismissed";

export function TrialBanner() {
  const { data } = useCurrentUser();
  const checkout = useStartCheckout();
  // Lazy initializers read client-only values (sessionStorage, the clock) once,
  // outside render and without an effect. Hydration-safe: this banner is gated
  // on `useCurrentUser` data, which is null until the query resolves after
  // hydration, so the SSR output carries no banner DOM to mismatch against.
  // `now` is a single snapshot — the banner shows a day count, not a live ticker.
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [now] = useState<number>(() =>
    typeof window === "undefined" ? 0 : Date.now()
  );

  const user = data?.user;
  if (!user || dismissed) return null;
  // Direct learners only (null access) with a live trial window.
  if (user.learningAccess !== null || !user.trialEndsAt) return null;

  const msLeft = new Date(user.trialEndsAt).getTime() - now;
  if (msLeft <= 0) return null; // expired — the paywall layout takes over

  const days = Math.ceil(msLeft / 86_400_000);
  const label =
    days <= 1 ? "Last day of your free trial" : `${days} days left in your free trial`;

  return (
    <div className="fixed inset-x-0 top-3 z-[60] mx-auto flex w-fit max-w-[calc(100vw-1rem)] items-center gap-3 rounded-full border border-foreground/12 bg-background/90 py-1.5 pl-4 pr-1.5 text-foreground shadow-lg backdrop-blur">
      <Sparkles size={13} className="shrink-0 text-emerald-400/90" />
      <span className="text-[13px] font-medium leading-tight tracking-tight">{label}</span>
      <button
        type="button"
        onClick={() => checkout.mutate("monthly")}
        disabled={checkout.isPending}
        className="font-mono-hud flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-foreground/90 px-3 text-[11px] tracking-[0.12em] text-background transition hover:bg-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        {checkout.isPending ? (
          <>
            <Loader2 size={12} className="animate-spin" /> REDIRECTING
          </>
        ) : (
          "SUBSCRIBE"
        )}
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-foreground/45 transition hover:text-foreground"
      >
        <X size={14} />
      </button>
    </div>
  );
}
