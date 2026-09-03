import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import {
  applySubscriptionState,
  recordSubscriptionBilling,
  recordBillingEvent,
  type SubscriptionBilling,
} from "@/lib/db/queries/users";

export const runtime = "nodejs";

/**
 * Stripe webhook — the single writer that reconciles local billing state from
 * Stripe. Public (no auth): authenticity comes from the signature check against
 * STRIPE_WEBHOOK_SECRET. Always returns 200 on a verified event so Stripe stops
 * retrying; handler work is idempotent (applySubscriptionState sets absolute
 * values, not deltas).
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhooks/stripe] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("[webhooks/stripe] signature verification failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await reconcileSubscription(customerIdOf(sub.customer), sub, event);
        break;
      }
      case "checkout.session.completed": {
        // Belt-and-suspenders alongside the subscription.* events: resolve the
        // real subscription status so access is granted the moment Stripe
        // confirms the first payment.
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id
          );
          await reconcileSubscription(customerIdOf(sub.customer), sub, event);
        }
        break;
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (err) {
    console.error(`[webhooks/stripe] handler error for ${event.type}:`, err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Single reconcile path for every subscription event: update the gating state
 * (unchanged behavior) AND append to the immutable billing_events log. The event
 * log write is best-effort — a failure there is logged but must not break gating
 * or trigger a Stripe retry, since the user-row write already succeeded.
 */
async function reconcileSubscription(
  customerId: string,
  sub: Stripe.Subscription,
  event: Stripe.Event
) {
  const billing = billingFromSubscription(sub);
  // Gating write first — must succeed (only the phase-1 columns).
  await applySubscriptionState(customerId, billing);

  // Analytics enrichment + event log are best-effort: a missing column/table
  // (migration not yet applied) must not break gating or trigger a Stripe retry.
  try {
    await recordSubscriptionBilling(customerId, billing);
    await recordBillingEvent({
      stripeEventId: event.id,
      customerId,
      subscriptionId: sub.id,
      eventType: event.type,
      status: sub.status,
      plan: billing.plan ?? null,
      interval: billing.interval ?? null,
      amountCents: billing.amountCents ?? null,
      occurredAt: new Date(event.created * 1000),
    });
  } catch (err) {
    console.error("[webhooks/stripe] billing analytics write failed (non-fatal):", err);
  }
}

/** Pull price / interval / lifecycle facts off a Stripe subscription. The price
 *  + billing period live on the first subscription item (Stripe moved
 *  current_period_* to the item in recent API versions); start_date / canceled_at
 *  are on the subscription itself. */
function billingFromSubscription(sub: Stripe.Subscription): SubscriptionBilling {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  return {
    subscriptionId: sub.id,
    status: sub.status,
    plan: price?.lookup_key ?? null,
    interval: price?.recurring?.interval ?? null,
    amountCents: price?.unit_amount ?? null,
    currentPeriodEnd: unixToDate(item?.current_period_end),
    startedAt: unixToDate(sub.start_date),
    canceledAt: unixToDate(sub.canceled_at),
  };
}

/** A Stripe unix timestamp (seconds) -> Date, or null when absent. */
function unixToDate(seconds: number | null | undefined): Date | null {
  return seconds != null ? new Date(seconds * 1000) : null;
}

/** A Stripe `customer` field is an id string or an expanded object. */
function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer
): string {
  return typeof customer === "string" ? customer : customer.id;
}
