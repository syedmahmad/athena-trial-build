import "server-only";
import Stripe from "stripe";
import { FAMILY_PLAN, lookupKeyForInterval, type BillingInterval } from "./plans";

/**
 * Server-only Stripe client. The API version is intentionally omitted — the
 * SDK pins the version it ships with, which is the safe default. Never import
 * this from a `"use client"` file (STRIPE_SECRET_KEY is not exposed to the
 * browser, so it would crash on use anyway).
 */

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY is not set — add a test key to .env (see scripts/stripe-setup.ts)."
      );
    }
    _stripe = new Stripe(key);
  }
  return _stripe;
}

/** Resolve the active Stripe Price for an interval by its stable lookup_key. */
export async function resolveFamilyPrice(
  interval: BillingInterval
): Promise<Stripe.Price> {
  const lookupKey = lookupKeyForInterval(interval);
  const { data } = await getStripe().prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  const price = data[0];
  if (!price) {
    throw new Error(
      `No active Stripe price for lookup_key "${lookupKey}". Run: pnpm tsx --env-file=.env scripts/stripe-setup.ts`
    );
  }
  return price;
}

export { FAMILY_PLAN };
