-- Clerk → Supabase Auth migration, Phase 1: foundation (additive, coexists
-- with Clerk). Adds the external-identity mapping to Supabase auth.users and
-- a provisioning trigger. users.id stays immutable (every FK points at it) —
-- we only swap which external identity column links it.
--
--  * users.auth_id  — links an app user to a Supabase auth.users row.
--  * clerk_id NOT NULL dropped — new (Supabase) signups have no clerk_id;
--    existing rows keep theirs during the dual-stack transition.
--  * on_auth_user_created — when a Supabase auth user is created, LINK the
--    matching Clerk-era app user by email if one exists and is unlinked,
--    else provision a fresh app user. (email is not unique here, so we link
--    the oldest unlinked match deterministically — handles legacy dupes and
--    the Phase-4 backfill without creating duplicate app users.)
--
-- NOTE: apply via Supabase Studio SQL editor (db push is blocked by the
-- April 2026 migration drift). Requires the `auth` schema (GoTrue), present
-- on Supabase projects + the local stack.

ALTER TABLE public.users
  ADD COLUMN auth_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.users
  ADD CONSTRAINT users_auth_id_key UNIQUE (auth_id); -- nullable: many NULLs OK
ALTER TABLE public.users ALTER COLUMN clerk_id DROP NOT NULL;

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
  WHERE email = NEW.email AND auth_id IS NULL
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
