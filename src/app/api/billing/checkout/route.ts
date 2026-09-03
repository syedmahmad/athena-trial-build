import { NextResponse } from "next/server";
import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { getStripe, resolveFamilyPrice } from "@/lib/stripe/client";
import { setStripeCustomerId } from "@/lib/db/queries/users";
import type { BillingInterval } from "@/lib/stripe/plans";

export const runtime = "nodejs";

/**
 * Start a hosted Stripe Checkout session for the Family/student subscription.
 * Returns `{ url }`; the client redirects the browser there. Access is NOT
 * granted here — the `checkout.session.completed` / `customer.subscription.*`
 * webhook flips `learning_access` once Stripe confirms payment.
 */
export async function POST(req: Request) {
  const { userId: externalId } = await getAuthIdentity();
  if (!externalId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getAppUser(externalId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { interval?: string };
  const interval: BillingInterval = body.interval === "yearly" ? "yearly" : "monthly";

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const stripe = getStripe();

  try {
    // One Stripe Customer per user, created lazily and reused (enables the
    // Billing Portal + ties webhook events back to this account). Guarded
    // against double-create: a prior checkout may have made a customer whose id
    // never reached our DB (write lost, or two checkouts racing). First reclaim
    // any customer tagged with this userId, and key the create itself so two
    // simultaneous requests collapse to a single Stripe customer.
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const existing = await stripe.customers.search({
        query: `metadata['userId']:'${user.id}'`,
        limit: 1,
      });
      customerId =
        existing.data[0]?.id ??
        (
          await stripe.customers.create(
            {
              email: user.email,
              name: user.displayName ?? undefined,
              metadata: { userId: user.id },
            },
            { idempotencyKey: `customer:create:${user.id}` }
          )
        ).id;
      await setStripeCustomerId(user.id, customerId);
    }

    const price = await resolveFamilyPrice(interval);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: price.id, quantity: 1 }],
      client_reference_id: user.id,
      metadata: { userId: user.id, plan: "family", interval },
      subscription_data: { metadata: { userId: user.id } },
      success_url: `${appUrl}/dashboard?welcome=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/dashboard`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL" },
        { status: 502 }
      );
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing/checkout] failed", err);
    const message = err instanceof Error ? err.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
