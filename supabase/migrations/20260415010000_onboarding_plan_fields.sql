-- Add onboarding plan fields to user_preferences
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS grade text,
  ADD COLUMN IF NOT EXISTS learner_types text[],
  ADD COLUMN IF NOT EXISTS interests text[],
  ADD COLUMN IF NOT EXISTS struggling_topic text;

-- Update onboarding_progress default step from 'gist' to 'plan'
ALTER TABLE onboarding_progress
  ALTER COLUMN current_step SET DEFAULT 'plan';
