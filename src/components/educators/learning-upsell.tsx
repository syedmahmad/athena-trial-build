"use client";

import { useState } from "react";
import Link from "next/link";
import { GraduationCap, Check, Sparkles, Loader2 } from "lucide-react";
import { useStartCheckout } from "@/hooks/use-billing";
import { FAMILY_PLAN, formatPrice, type BillingInterval } from "@/lib/stripe/plans";

/**
 * Shown in place of the protected app when an account can't reach the rich
 * learning experience. Two reasons land here:
 *   - "homework-only": an educator-funnel student (learning_access === false).
 *     Homework lives on the public share link, so they keep everything their
 *     teacher assigns — only the paid learning experience is walled off.
 *   - "subscription-ended": a former subscriber whose subscription lapsed.
 *   - "trial-expired": a direct learner whose free trial ran out.
 */
type LearningUpsellReason = "homework-only" | "subscription-ended" | "trial-expired";

const PERKS = [
  "Step-by-step AI micro-lessons on the whiteboard",
  "A voice tutor that helps the moment you're stuck",
  "Unlimited adaptive practice + full SAT practice tests",
  "Learn any topic you want, not just what's assigned",
  "Progress tracking, flashcards, and podcasts",
];

const COPY: Record<
  LearningUpsellReason,
  { eyebrow: string; title: string; blurb: string }
> = {
  "homework-only": {
    eyebrow: "ATHENA LEARNING",
    title: "The full Athena experience",
    blurb:
      "Your homework is always free. Lessons, tutoring, and practice are part of an Athena learning plan. Pick up where your homework leaves off.",
  },
  "subscription-ended": {
    eyebrow: "SUBSCRIPTION ENDED",
    title: "Pick your learning back up",
    blurb:
      "Your subscription has ended. Resubscribe to bring back your lessons, voice tutor, and full practice tests.",
  },
  "trial-expired": {
    eyebrow: "FREE TRIAL ENDED",
    title: "Keep learning with Athena",
    blurb:
      "Your free trial has ended. Subscribe to keep your lessons, voice tutor, and full practice tests going.",
  },
};

const MONTHLY = formatPrice(FAMILY_PLAN.prices.monthly.unitAmount);
const YEARLY = formatPrice(FAMILY_PLAN.prices.yearly.unitAmount);

export function LearningUpsell({
  reason = "homework-only",
}: {
  reason?: LearningUpsellReason;
}) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const checkout = useStartCheckout();
  const copy = COPY[reason];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="w-full max-w-lg text-center">
        <div className="font-mono-hud hud-dim mb-4 flex items-center justify-center gap-2 text-[11px] tracking-[0.3em]">
          <Sparkles size={13} /> {copy.eyebrow}
        </div>
        <GraduationCap size={32} className="mx-auto text-foreground/70" />
        <h1 className="mt-4 text-3xl font-light tracking-tight">
          {copy.title}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-foreground/70">
          {copy.blurb}
        </p>

        <ul className="mx-auto mt-8 max-w-sm space-y-2.5 text-left">
          {PERKS.map((p) => (
            <li key={p} className="flex items-start gap-3 text-[15px] text-foreground/85">
              <Check size={16} className="mt-0.5 shrink-0 text-emerald-400/90" />
              {p}
            </li>
          ))}
        </ul>

        <div className="mt-8 rounded-xl border border-foreground/12 bg-foreground/[0.03] p-5">
          {/* Monthly / yearly toggle */}
          <div className="mx-auto mb-4 flex w-full max-w-[260px] rounded-full border border-foreground/12 p-1">
            {(["monthly", "yearly"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setInterval(opt)}
                disabled={checkout.isPending}
                className={`font-mono-hud flex-1 rounded-full py-1.5 text-[11px] tracking-[0.15em] transition ${
                  interval === opt
                    ? "bg-foreground/90 text-background"
                    : "text-foreground/55 hover:text-foreground"
                }`}
              >
                {opt === "monthly" ? "MONTHLY" : "YEARLY"}
              </button>
            ))}
          </div>

          <div className="text-2xl font-light text-foreground">
            {interval === "monthly" ? (
              <>
                {MONTHLY}
                <span className="text-base text-foreground/55">/mo</span>
              </>
            ) : (
              <>
                {YEARLY}
                <span className="text-base text-foreground/55">/yr</span>
                <span className="ml-2 align-middle text-[11px] text-emerald-400/90">
                  Save 38%
                </span>
              </>
            )}
          </div>
          <p className="font-mono-hud hud-dim mt-2 text-[11px] leading-relaxed tracking-[0.1em]">
            Free for students at partner schools with need-based access. Ask
            your teacher.
          </p>

          <button
            type="button"
            onClick={() => checkout.mutate(interval)}
            disabled={checkout.isPending}
            className="font-mono-hud hud-text mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-foreground/20 bg-foreground/90 text-background transition hover:bg-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checkout.isPending ? (
              <>
                <Loader2 size={15} className="animate-spin" /> REDIRECTING
              </>
            ) : (
              "SUBSCRIBE"
            )}
          </button>

          {checkout.isError && (
            <p className="mt-3 text-[13px] text-red-400">
              {(checkout.error as Error).message}
            </p>
          )}
        </div>

        {reason === "homework-only" && (
          <Link
            href="/educators"
            className="font-mono-hud hud-dim mt-6 inline-block text-[11px] tracking-[0.15em] underline-offset-4 transition hover:text-foreground hover:underline"
          >
            ← BACK TO YOUR HOMEWORK
          </Link>
        )}
      </div>
    </div>
  );
}
