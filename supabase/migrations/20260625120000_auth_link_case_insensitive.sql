-- Clerk → Supabase Auth: make the provisioning link case-insensitive.
--
-- handle_new_auth_user() (migration 20260615140000) matched the existing
-- app user with `email = NEW.email` — an exact, case-sensitive compare.
-- Supabase auth (GoTrue) stores auth.users.email lower-cased, but Clerk-era
-- public.users rows can carry mixed-case / whitespace emails. When the casing
-- differed, the link missed and a DUPLICATE app user was provisioned, leaving
-- the original (which owns the user's real data) stranded on auth_id = NULL.
-- See the educator duplicate-account collisions diagnosed 2026-06-25.
--
-- Fix: compare on lower(trim(email)). Ordering by created_at is unchanged
-- (still links the oldest unlinked match) — this only widens what counts as a
-- match, it does not retroactively fix already-stranded rows (those are
-- re-parented by hand).
--
-- NOTE: apply via Supabase Studio SQL editor (db push is blocked by the
-- April 2026 migration drift).

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  existing_id uuid;
BEGIN
  SELECT id INTO existing_id
  FROM public.users
  WHERE lower(trim(email)) = lower(trim(NEW.email)) AND auth_id IS NULL
  ORDER BY created_at
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.users
      SET auth_id = NEW.id, updated_at = now()
      WHERE id = existing_id;
  ELSE
    INSERT INTO public.users (auth_id, email) VALUES (NEW.id, NEW.email);
  END IF;
  RETURN NEW;
END;
$$;
