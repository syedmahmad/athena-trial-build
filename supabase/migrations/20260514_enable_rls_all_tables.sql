-- Enable Row Level Security on all public tables that don't already have it.
--
-- Context: the app used to access Supabase from the server with the publishable
-- anon key. That key ships in the browser bundle and, without RLS, allowed
-- anyone to read/write any table directly via PostgREST.
--
-- New posture:
--   * The app now uses the service-role key (see src/lib/supabase/client.ts).
--   * The service role bypasses RLS, so legitimate server traffic is unaffected.
--   * RLS is enabled here with NO policies → default-deny for the anon and
--     authenticated roles. This locks the public anon key out of every table.
--
-- We intentionally do NOT use FORCE ROW LEVEL SECURITY: the service role must
-- continue to bypass RLS for app code to work.
--
-- The full_sat_* tables already had RLS enabled in 20260413_full_sat.sql with
-- per-user policies; they are skipped here.

ALTER TABLE IF EXISTS public.users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sessions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.schedules              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_preferences      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.onboarding_progress   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.friendships            ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.topics                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subtopics              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subtopic_lore         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subsection_skills     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.custom_topics          ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.lessons                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.micro_lessons          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.micro_lesson_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.learning_queue         ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.problems               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.quiz_sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.quiz_answers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.quiz_question_events  ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.daily_quests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.daily_quest_problems  ENABLE ROW LEVEL SECURITY;
