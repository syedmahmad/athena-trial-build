import { NextResponse } from "next/server";
import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { getStripe } from "@/lib/stripe/client";

export const runtime = "nodejs";

/**
 * Open the Stripe Billing Portal so a subscriber can update payment, view
 * invoices, or cancel. Returns `{ url }` for the client to redirect to.
 */
export async function POST() {
  const { userId: externalId } = await getAuthIdentity();
  if (!externalId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getAppUser(externalId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!user.stripeCustomerId) {
    return NextResponse.json(
      { error: "No subscription to manage yet" },
      { status: 400 }
    );
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appUrl}/dashboard`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing/portal] failed", err);
    const message = err instanceof Error ? err.message : "Portal failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
