-- Reset a user's onboarding progress by email.
-- Usage: psql $DATABASE_URL -v email="'user@example.com'" -f scripts/reset-onboarding.sql

CREATE OR REPLACE FUNCTION reset_onboarding(user_email TEXT)
RETURNS void AS $$
DECLARE
  uid UUID;
BEGIN
  SELECT id INTO uid FROM users WHERE email = user_email;

  IF uid IS NULL THEN
    RAISE EXCEPTION 'No user found with email: %', user_email;
  END IF;

  DELETE FROM onboarding_progress WHERE user_id = uid;
  DELETE FROM quiz_answers         WHERE session_id IN (SELECT id FROM quiz_sessions WHERE user_id = uid);
  DELETE FROM quiz_sessions        WHERE user_id = uid;
  DELETE FROM schedules            WHERE user_id = uid;
  DELETE FROM sessions             WHERE user_id = uid;
  DELETE FROM learning_queue       WHERE user_id = uid;
  DELETE FROM user_preferences     WHERE user_id = uid;

  UPDATE users
     SET onboarding_completed = false,
         skill_score = NULL,
         updated_at = now()
   WHERE id = uid;

  INSERT INTO onboarding_progress (user_id, current_step)
  VALUES (uid, 'plan');

  RAISE NOTICE 'Onboarding reset for % (id: %)', user_email, uid;
END;
$$ LANGUAGE plpgsql;

-- Run it (pass email via psql -v or replace directly)
SELECT reset_onboarding(:'email');
