-- Billing, phase 1: Stripe subscription state on the user row.
--
-- The Family/student subscription ($7.99/mo · $59/yr) sold via Stripe hosted
-- Checkout. Paying flips users.learning_access FALSE -> TRUE (the homework ->
-- learning paywall, see 20260615120000_educator_student_accounts.sql).
--
-- These columns are the local source of truth for access gating: the Stripe
-- webhook writes them, and the (protected) layout reads learning_access on the
-- hot path with no network call to Stripe.
--
--   * stripe_customer_id     - the account's Stripe Customer (one per user,
--                              created lazily at first checkout; reused for the
--                              Billing Portal). Indexed for webhook reverse-lookup.
--   * stripe_subscription_id - the active/most-recent subscription.
--   * subscription_status    - mirror of the Stripe subscription status
--                              (active | trialing | past_due | canceled | ...).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_customer_id     text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS subscription_status    text;

CREATE INDEX IF NOT EXISTS users_stripe_customer_id_idx
  ON public.users (stripe_customer_id);
