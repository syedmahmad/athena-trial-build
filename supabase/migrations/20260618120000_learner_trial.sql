-- Consumer learner free trial, separate from the educator homework paywall.
--
-- Two independent gates now share the users.learning_access column:
--   * Educator funnel (EDUCATOR_PAYWALL): homework-funnel students are set
--     FALSE = homework-only. Educator features stay free on signup.
--   * Direct learners (LEARNER_PAYWALL): a brand-new account at the main site
--     comes in as NULL and gets a free trial; access ends when the trial does
--     unless they subscribe (Stripe flips learning_access NULL/FALSE -> TRUE).
--
-- trial_ends_at carries the trial deadline. We ADD the column with no default
-- first (so every existing row stays NULL = grandfathered, never trial-gated),
-- THEN set the default so only future inserts are stamped with a trial window.
--
-- NOTE: apply via Supabase Studio SQL editor (db push is blocked by the
-- April 2026 migration drift). Studio reloads PostgREST automatically.

ALTER TABLE public.users ADD COLUMN trial_ends_at timestamptz;
ALTER TABLE public.users
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '14 days');
