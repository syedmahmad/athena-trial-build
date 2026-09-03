/**
 * Family/student plan definition — the single source of truth shared by the
 * setup script (which creates the Stripe product + prices), the checkout route
 * (which resolves a price by lookup_key), and the upsell UI copy.
 *
 * Prices are referenced by a stable Stripe `lookup_key`, never a hard-coded
 * `price_…` id, so re-running the setup script is idempotent and no id ever has
 * to be pasted into env.
 */

export type BillingInterval = "monthly" | "yearly";

export const FAMILY_PLAN = {
  /** Stripe Product name + the product `metadata.athena_plan` tag used to find it. */
  productName: "Athena Family",
  productTag: "family",
  currency: "usd",
  prices: {
    monthly: { lookupKey: "family_monthly", unitAmount: 799, interval: "month" as const },
    yearly: { lookupKey: "family_yearly", unitAmount: 5900, interval: "year" as const },
  },
} as const;

export function lookupKeyForInterval(interval: BillingInterval): string {
  return interval === "yearly"
    ? FAMILY_PLAN.prices.yearly.lookupKey
    : FAMILY_PLAN.prices.monthly.lookupKey;
}

/** Display price, e.g. "$7.99". */
export function formatPrice(unitAmount: number): string {
  return `$${(unitAmount / 100).toFixed(2).replace(/\.00$/, "")}`;
}
