-- =============================================================================
-- Analytics reporting layer  (Metabase data source / tool-agnostic)
-- =============================================================================
-- Purpose: a curated, RLS-proof `analytics` schema that Metabase (or an in-app
-- dashboard, or any BI tool) reads from. NOTHING here writes to or exposes the
-- raw `public` tables — Metabase connects as `metabase_readonly`, which can only
-- SELECT the views in this schema.
--
-- WHY VIEWS, NOT RAW TABLES:
--   * RLS is enabled on all public tables (20260514_enable_rls_all_tables).
--     A plain reader role would see ZERO rows. Views run with their OWNER's
--     privileges (security_invoker is OFF by default), and the owner here is
--     `postgres` (BYPASSRLS), so the views read every row — while the reader
--     role never gets direct access to a base table.
--   * Curated views = ~15 clean metric sources instead of 17 cryptic tables.
--
-- HOW TO APPLY:
--   `supabase db push` is currently blocked by remote/local drift, so run this
--   in the Supabase SQL Editor (Studio). Studio runs as `postgres`, which is
--   exactly the owner we need for the RLS-bypass property above. Run the whole
--   file EXCEPT the final role section first; then edit the password in the
--   role section and run that.
--
-- MASTERY DEFINITION (the one pedagogical knob to confirm):
--   `subsection_skills.level` is 1..10. We treat level >= 8 as "mastered" and
--   rescale level -> 0..100 as the Concept Mastery Score. Tune MASTERY_LEVEL
--   below if your product defines mastery differently.
-- =============================================================================

create schema if not exists analytics;
comment on schema analytics is
  'Curated, read-only reporting views over public.* for Metabase/BI. Views owned by postgres bypass RLS by design.';

-- =============================================================================
-- 1. LONGITUDINAL SNAPSHOT  (time-critical — start collecting immediately)
-- -----------------------------------------------------------------------------
-- subsection_skills holds CURRENT mastery state only. Retention / mastery-gain /
-- concept-recovery need point-in-time history, which cannot be backfilled. This
-- table captures a daily row per (user, subtopic); the rollup function below
-- populates it.
-- =============================================================================

create table if not exists analytics.subsection_skill_snapshots (
  snapshot_date    date        not null,
  user_id          uuid        not null,
  subtopic_id      uuid        not null,
  section_category text,
  level            integer,
  mastery_score    integer,           -- level rescaled to 0..100
  xp               integer,
  total_attempts   integer,
  correct_attempts integer,
  accuracy         numeric(5,1),      -- correct/total * 100 at snapshot time
  last_10_correct  integer,           -- count of `true` in last_10[]
  streak_correct   integer,
  streak_wrong     integer,
  is_mastered      boolean,           -- level >= MASTERY_LEVEL
  last_seen_at     timestamptz,
  captured_at      timestamptz not null default now(),
  primary key (snapshot_date, user_id, subtopic_id)
);

comment on table analytics.subsection_skill_snapshots is
  'Daily point-in-time copy of public.subsection_skills. Powers retention, mastery-gain, and concept-recovery. Backfill is impossible — every missed day is lost history.';

-- Rollup function: upsert today's snapshot from current skill state.
-- SECURITY DEFINER + owned by postgres => reads subsection_skills past RLS.
create or replace function analytics.snapshot_subsection_skills()
returns integer
language plpgsql
security definer
set search_path = public, analytics
as $$
declare
  mastery_level constant integer := 8;   -- level >= 8 (of 10) == mastered
  n integer;
begin
  insert into analytics.subsection_skill_snapshots (
    snapshot_date, user_id, subtopic_id, section_category, level, mastery_score,
    xp, total_attempts, correct_attempts, accuracy, last_10_correct,
    streak_correct, streak_wrong, is_mastered, last_seen_at
  )
  select
    current_date,
    s.user_id,
    s.subtopic_id,
    s.section_category,
    s.level,
    round(((s.level - 1) / 9.0) * 100)::int,         -- 1->0, 10->100
    s.xp,
    s.total_attempts,
    s.correct_attempts,
    case when s.total_attempts > 0
         then round(100.0 * s.correct_attempts / s.total_attempts, 1)
         else 0 end,
    (select count(*) from unnest(s.last_10) v where v),
    s.streak_correct,
    s.streak_wrong,
    s.level >= mastery_level,
    s.last_seen_at
  from public.subsection_skills s
  on conflict (snapshot_date, user_id, subtopic_id) do update set
    section_category = excluded.section_category,
    level            = excluded.level,
    mastery_score    = excluded.mastery_score,
    xp               = excluded.xp,
    total_attempts   = excluded.total_attempts,
    correct_attempts = excluded.correct_attempts,
    accuracy         = excluded.accuracy,
    last_10_correct  = excluded.last_10_correct,
    streak_correct   = excluded.streak_correct,
    streak_wrong     = excluded.streak_wrong,
    is_mastered      = excluded.is_mastered,
    last_seen_at     = excluded.last_seen_at,
    captured_at      = now();

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function analytics.snapshot_subsection_skills() is
  'Upserts today''s row into subsection_skill_snapshots. Idempotent within a day. Schedule nightly via pg_cron or an external job.';

-- Seed a day-0 snapshot right now so longitudinal views have a starting point.
select analytics.snapshot_subsection_skills();

-- Nightly schedule IF pg_cron is enabled (Dashboard -> Database -> Extensions).
-- Guarded so the migration still succeeds when pg_cron is absent. 07:10 UTC ~= midnight PT.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'analytics-daily-skill-snapshot',
      '10 7 * * *',
      $cron$ select analytics.snapshot_subsection_skills(); $cron$
    );
    raise notice 'pg_cron job ''analytics-daily-skill-snapshot'' scheduled.';
  else
    raise notice 'pg_cron NOT enabled: snapshot will not auto-run. Enable the extension and re-run this block, or schedule an external nightly job that calls analytics.snapshot_subsection_skills().';
  end if;
end;
$$;

-- =============================================================================
-- 2. DIMENSION  (subtopic / topic names for joins + Metabase display)
-- -----------------------------------------------------------------------------
-- NOTE: verify the FK column name `subtopics.topic_id` against your live schema;
-- if it differs, this is the only view to adjust.
-- =============================================================================

create or replace view analytics.subtopic_dim as
select
  st.id            as subtopic_id,
  st.name          as subtopic_name,
  st.slug          as subtopic_slug,
  t.id             as topic_id,
  t.name           as topic_name,
  t.slug           as topic_slug
from public.subtopics st
left join public.topics t on t.id = st.topic_id;

-- =============================================================================
-- 3. ENGAGEMENT  (✅ computable now)
-- =============================================================================

-- Unified "a learner did something" activity stream (quiz, lesson, or daily quest).
create or replace view analytics.learner_activity as
  select user_id, created_at::date  as activity_date from public.quiz_sessions
  union
  select user_id, started_at::date                  from public.micro_lesson_sessions
  union
  select user_id, quest_date                        from public.daily_quests;

-- Daily Active Learners
create or replace view analytics.daily_active_learners as
select activity_date, count(distinct user_id) as active_learners
from analytics.learner_activity
group by activity_date;

-- Weekly Active Learners (week starting Monday)
create or replace view analytics.weekly_active_learners as
select date_trunc('week', activity_date)::date as week_start,
       count(distinct user_id)                 as active_learners
from analytics.learner_activity
group by 1;

-- Per-session engagement: questions, accuracy, time, hint/tutor counts.
-- Powers Avg Session Length, Questions per Session, Sessions per Week.
create or replace view analytics.session_engagement as
select
  qs.id                                   as session_id,
  qs.user_id,
  qs.source,
  qs.subtopic_id,
  qs.created_at,
  qs.created_at::date                     as session_date,
  qs.total_questions,
  qs.time_elapsed_seconds,
  round(qs.time_elapsed_seconds / 60.0, 1) as session_minutes,
  count(qa.id)                            as answered,
  count(qa.id) filter (where qa.is_correct)       as correct,
  count(qa.id) filter (where qa.hint_used)        as hints_used,
  count(qa.id) filter (where qa.tutor_used)       as tutor_used,
  count(qa.id) filter (where qa.wrong_count = 0 and qa.is_correct) as first_attempt_correct
from public.quiz_sessions qs
left join public.quiz_answers qa on qa.session_id = qs.id
group by qs.id;

-- Learning streaks (current/best live on users; daily_quests gives history).
create or replace view analytics.learner_streaks as
select id as user_id, best_streak, total_xp, current_composite, start_composite
from public.users;

-- =============================================================================
-- 4. LEARNING PERFORMANCE  (✅ now)
-- =============================================================================

-- Accuracy + first-attempt by subtopic (answer-level, joined through sessions).
create or replace view analytics.accuracy_by_subtopic as
select
  qs.subtopic_id,
  count(qa.id)                                   as total_answers,
  count(qa.id) filter (where qa.is_correct)      as correct_answers,
  round(100.0 * count(qa.id) filter (where qa.is_correct)
        / nullif(count(qa.id), 0), 1)            as accuracy_pct,
  round(100.0 * count(qa.id) filter (where qa.wrong_count = 0 and qa.is_correct)
        / nullif(count(qa.id), 0), 1)            as first_attempt_success_pct,
  round(avg(qa.response_time_ms))                as avg_response_time_ms
from public.quiz_answers qa
join public.quiz_sessions qs on qs.id = qa.session_id
group by qs.subtopic_id;

-- Current concept mastery per (user, subtopic). Mastery Score 0..100 + accuracy.
create or replace view analytics.concept_mastery as
select
  s.user_id,
  s.subtopic_id,
  s.section_category,
  s.level,
  round(((s.level - 1) / 9.0) * 100)::int        as mastery_score,
  s.level >= 8                                    as is_mastered,
  s.total_attempts,
  s.correct_attempts,
  round(100.0 * s.correct_attempts / nullif(s.total_attempts, 0), 1) as accuracy_pct,
  (select count(*) from unnest(s.last_10) v where v) as last_10_correct,
  s.last_seen_at
from public.subsection_skills s;

-- Repeated Error Rate: same problem answered wrong in >= 2 distinct sessions.
create or replace view analytics.repeated_errors as
select
  qs.user_id,
  qa.problem_id,
  count(*) filter (where not qa.is_correct)        as wrong_attempts,
  count(distinct qa.session_id) filter (where not qa.is_correct) as wrong_sessions
from public.quiz_answers qa
join public.quiz_sessions qs on qs.id = qa.session_id
group by qs.user_id, qa.problem_id
having count(distinct qa.session_id) filter (where not qa.is_correct) >= 2;

-- =============================================================================
-- 5. TUTOR EFFECTIVENESS  (✅ now — from the quiz_question_events stream)
-- =============================================================================

create or replace view analytics.tutor_effectiveness as
select
  qs.subtopic_id,
  count(*) filter (where e.event_type in ('answer_correct','answer_wrong')) as answers,
  count(*) filter (where e.event_type = 'hint_shown')        as hints_shown,
  count(*) filter (where e.event_type = 'tutor_entered')     as tutor_entered,
  count(*) filter (where e.event_type = 'tutor_correct')     as tutor_correct,
  count(*) filter (where e.event_type = 'practice_exhausted') as full_solution_reveals,
  -- Explanation Success Rate: correct after entering the tutor
  round(100.0 * count(*) filter (where e.event_type = 'tutor_correct')
        / nullif(count(*) filter (where e.event_type = 'tutor_entered'), 0), 1)
                                                              as explanation_success_pct,
  -- Hint Dependency Rate: hints per answered question
  round(100.0 * count(*) filter (where e.event_type = 'hint_shown')
        / nullif(count(*) filter (where e.event_type in ('answer_correct','answer_wrong')), 0), 1)
                                                              as hint_dependency_pct,
  -- Full-Solution Dependency Rate: practice exhausted per answered question
  round(100.0 * count(*) filter (where e.event_type = 'practice_exhausted')
        / nullif(count(*) filter (where e.event_type in ('answer_correct','answer_wrong')), 0), 1)
                                                              as full_solution_dependency_pct
from public.quiz_question_events e
join public.quiz_sessions qs on qs.id = e.session_id
group by qs.subtopic_id;

-- =============================================================================
-- 6. BEHAVIORAL INTELLIGENCE  (✅ now)
-- =============================================================================

-- Quiz completion / drop-off: answered vs total_questions per session.
create or replace view analytics.quiz_completion as
select
  se.session_id,
  se.user_id,
  se.subtopic_id,
  se.session_date,
  se.total_questions,
  se.answered,
  (se.answered >= se.total_questions)              as completed,
  (se.answered <  se.total_questions)              as dropped_off
from analytics.session_engagement se;

-- Micro-lesson engagement: duration, follow-up questions (chat), check-ins, completion.
create or replace view analytics.micro_lesson_engagement as
select
  user_id,
  subtopic_id,
  started_at::date                                 as lesson_date,
  duration_seconds,
  round(duration_seconds / 60.0, 1)                as lesson_minutes,
  steps_viewed,
  total_steps,
  checkins_correct,
  checkins_total,
  chat_messages                                    as follow_up_questions,
  completed
from public.micro_lesson_sessions;

-- Curriculum completion: completed queue items vs assigned, per user.
create or replace view analytics.curriculum_completion as
select
  user_id,
  count(*)                                         as assigned_lessons,
  count(*) filter (where status = 'completed' or progress_pct >= 100) as completed_lessons,
  round(100.0 * count(*) filter (where status = 'completed' or progress_pct >= 100)
        / nullif(count(*), 0), 1)                  as completion_pct
from public.learning_queue
group by user_id;

-- =============================================================================
-- 7. LONGITUDINAL VIEWS  (🔧 valid now, populate as snapshots accumulate)
-- -----------------------------------------------------------------------------
-- These return rows only once >= 2 daily snapshots exist (mastery-gain/retention
-- need a "then" and a "now"). Empty today is expected and correct.
-- =============================================================================

-- Mastery Gain: change in mastery_score vs ~7 days earlier, per user/subtopic.
create or replace view analytics.mastery_gain_weekly as
select
  now_s.snapshot_date,
  now_s.user_id,
  now_s.subtopic_id,
  now_s.mastery_score                              as mastery_now,
  prev_s.mastery_score                             as mastery_prev,
  (now_s.mastery_score - prev_s.mastery_score)     as mastery_gain
from analytics.subsection_skill_snapshots now_s
join analytics.subsection_skill_snapshots prev_s
  on prev_s.user_id = now_s.user_id
 and prev_s.subtopic_id = now_s.subtopic_id
 and prev_s.snapshot_date = now_s.snapshot_date - 7;

-- Concept Retention (N-day): of concepts mastered on day D, still mastered on D+N.
-- Parameterized as a function so 7-day and 30-day share one definition.
create or replace function analytics.concept_retention(window_days integer)
returns table (
  cohort_date  date,
  mastered     bigint,
  retained     bigint,
  retention_pct numeric
)
language sql
stable
as $$
  select
    base.snapshot_date as cohort_date,
    count(*)           as mastered,
    count(*) filter (where later.is_mastered) as retained,
    round(100.0 * count(*) filter (where later.is_mastered)
          / nullif(count(*), 0), 1) as retention_pct
  from analytics.subsection_skill_snapshots base
  left join analytics.subsection_skill_snapshots later
    on later.user_id = base.user_id
   and later.subtopic_id = base.subtopic_id
   and later.snapshot_date = base.snapshot_date + window_days
  where base.is_mastered
  group by base.snapshot_date;
$$;

create or replace view analytics.concept_retention_7d  as select * from analytics.concept_retention(7);
create or replace view analytics.concept_retention_30d as select * from analytics.concept_retention(30);

-- Concept Recovery: subtopics that went from NOT mastered -> mastered over the
-- snapshot window (earliest vs latest snapshot per user/subtopic).
create or replace view analytics.concept_recovery as
with bounds as (
  select user_id, subtopic_id,
         min(snapshot_date) as first_date,
         max(snapshot_date) as last_date
  from analytics.subsection_skill_snapshots
  group by user_id, subtopic_id
)
select
  b.user_id,
  b.subtopic_id,
  f.is_mastered as was_mastered,
  l.is_mastered as now_mastered
from bounds b
join analytics.subsection_skill_snapshots f
  on f.user_id = b.user_id and f.subtopic_id = b.subtopic_id and f.snapshot_date = b.first_date
join analytics.subsection_skill_snapshots l
  on l.user_id = b.user_id and l.subtopic_id = b.subtopic_id and l.snapshot_date = b.last_date
where f.is_mastered = false and l.is_mastered = true;

-- =============================================================================
-- 8. READ-ONLY ROLE FOR METABASE   ⚠️  EDIT THE PASSWORD BEFORE RUNNING
-- -----------------------------------------------------------------------------
-- Generate a hex password (`openssl rand -hex 32`) and paste it below. Hex avoids
-- URL-encoding pain in the Metabase connection settings. This role can ONLY read
-- the analytics schema — no public, no umami, no metabase, no writes.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'metabase_readonly') then
    create role metabase_readonly with login password 'CHANGE_ME_TO_HEX_PASSWORD';
  end if;
end;
$$;

grant connect on database postgres to metabase_readonly;
grant usage  on schema analytics to metabase_readonly;
grant select on all tables in schema analytics to metabase_readonly;          -- includes views
grant execute on function analytics.concept_retention(integer) to metabase_readonly;

-- New views created later by postgres are auto-granted to the reader:
alter default privileges in schema analytics grant select on tables to metabase_readonly;

-- Belt-and-suspenders: keep it out of app data.
revoke all on schema public from metabase_readonly;
alter role metabase_readonly set search_path = analytics;

-- Lock down the one base TABLE in this schema. Views can't carry RLS; this table
-- can, so enable it + a SELECT policy for the reader. The postgres-owned views and
-- the SECURITY DEFINER rollup bypass RLS and are unaffected; anon/authenticated are
-- blocked outright (they also lack USAGE on `analytics`). Silences the Studio
-- "table without RLS" advisor and matches the project's RLS-everywhere posture.
alter table analytics.subsection_skill_snapshots enable row level security;

drop policy if exists "metabase_readonly reads snapshots" on analytics.subsection_skill_snapshots;
create policy "metabase_readonly reads snapshots"
  on analytics.subsection_skill_snapshots
  for select to metabase_readonly using (true);

-- Sanity checks (should be: can_read_analytics=true, can_read_public_users=false)
select
  has_schema_privilege('metabase_readonly','analytics','usage')        as can_read_analytics,
  has_table_privilege ('metabase_readonly','public.users','select')    as can_read_public_users;
