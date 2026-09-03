"use client";

import { useMutation } from "@tanstack/react-query";
import type { BillingInterval } from "@/lib/stripe/plans";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/**
 * Start hosted Stripe Checkout for the Family plan and redirect the browser to
 * Stripe. On success the user returns to `/dashboard`; the webhook (not this
 * call) is what grants learning access.
 */
export function useStartCheckout() {
  return useMutation({
    mutationFn: (interval: BillingInterval) =>
      fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      }).then((r) => jsonOrThrow<{ url: string }>(r)),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });
}

/** Open the Stripe Billing Portal (manage / cancel an existing subscription). */
export function useBillingPortal() {
  return useMutation({
    mutationFn: () =>
      fetch("/api/billing/portal", { method: "POST" }).then((r) =>
        jsonOrThrow<{ url: string }>(r)
      ),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });
}
