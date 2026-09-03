-- Adds tutor character + voice columns to user_preferences so the
-- chosen avatar and ElevenLabs voice follow the user across devices.
-- Both nullable; null means "use the app default" (the env-configured
-- voice and the orb avatar). Stored as text — character ids are a
-- small enum maintained in src/lib/tutor-characters.ts; voice ids are
-- opaque ElevenLabs strings.

ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "tutor_character_id" text,
  ADD COLUMN IF NOT EXISTS "tutor_voice_id" text;
