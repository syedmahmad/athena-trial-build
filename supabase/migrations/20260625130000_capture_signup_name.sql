-- Capture the user's name (and avatar) at signup from auth metadata.
--
-- handle_new_auth_user previously seeded only (auth_id, email), so every new
-- account landed with a NULL display_name even when we had a name to use:
--   * Google OAuth puts the name in raw_user_meta_data->>'full_name'/'name'
--     and the photo in 'avatar_url'/'picture' automatically.
--   * Email/password + magic-link signups now pass options.data.full_name from
--     the auth form, which Supabase writes to the same raw_user_meta_data.
--
-- This rewrites the trigger to read those keys on both branches (new insert and
-- the email-match link), using COALESCE so we never clobber a name/avatar that
-- already exists on a matched row.
--
-- NOTE: apply via Supabase Studio SQL editor (db push is blocked by the
-- April 2026 migration drift). Re-running is safe (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  existing_id uuid;
  meta_name   text;
  meta_avatar text;
BEGIN
  -- Prefer full_name (Google, our form) then name; blank/whitespace -> NULL.
  meta_name := NULLIF(TRIM(COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name'
  )), '');
  meta_avatar := NULLIF(COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  ), '');

  SELECT id INTO existing_id
  FROM public.users
  WHERE email = NEW.email AND auth_id IS NULL
  ORDER BY created_at
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.users
      SET auth_id      = NEW.id,
          display_name = COALESCE(display_name, meta_name),
          avatar_url   = COALESCE(avatar_url, meta_avatar),
          updated_at   = now()
      WHERE id = existing_id;
  ELSE
    INSERT INTO public.users (auth_id, email, display_name, avatar_url)
      VALUES (NEW.id, NEW.email, meta_name, meta_avatar);
  END IF;
  RETURN NEW;
END;
$$;

-- One-time backfill: accounts that signed in (often via Google) before this
-- trigger captured names already carry one in auth metadata. Fill only where we
-- have nothing, so a real name is never overwritten.
UPDATE public.users u
SET display_name = NULLIF(TRIM(COALESCE(
      a.raw_user_meta_data->>'full_name',
      a.raw_user_meta_data->>'name'
    )), ''),
    avatar_url = COALESCE(u.avatar_url, NULLIF(COALESCE(
      a.raw_user_meta_data->>'avatar_url',
      a.raw_user_meta_data->>'picture'
    ), '')),
    updated_at = now()
FROM auth.users a
WHERE u.auth_id = a.id
  AND u.display_name IS NULL
  AND NULLIF(TRIM(COALESCE(
        a.raw_user_meta_data->>'full_name',
        a.raw_user_meta_data->>'name'
      )), '') IS NOT NULL;
