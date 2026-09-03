-- =============================================================================
-- Weekly cohort retention
-- -----------------------------------------------------------------------------
-- Of the users who signed up in week W, what fraction did *something* (quiz,
-- micro-lesson, or daily quest) in week W+N? Mirrors the Umami retention grid
-- but at weekly granularity and grounded in real learning activity rather than
-- pageviews.
--
-- Cohort key = signup week (date_trunc('week', users.created_at), Monday-based to
-- match analytics.weekly_active_learners). Activity source = analytics.learner_activity.
--
-- NOTE ON WEEK 0: because cohorts are keyed on signup (not first activity),
-- week_n = 0 is the ACTIVATION rate -- the % of signups who did anything in their
-- first week -- not a guaranteed 100%. This is intentional and usually more useful
-- than Umami's first-visit framing. For a first-activity cohort (week 0 == 100%),
-- swap the `cohorts` CTE to:
--     select user_id, date_trunc('week', min(activity_date))::date as cohort_week
--     from analytics.learner_activity group by user_id
--
-- Long format (one row per cohort x week_n) -- pivot in Metabase with
-- rows = cohort_week, columns = week_n, value = retention_pct.
-- =============================================================================

create or replace view analytics.weekly_cohort_retention as
with cohorts as (
  select id as user_id,
         date_trunc('week', created_at)::date as cohort_week
  from public.users
),
activity_weeks as (
  select distinct user_id,
         date_trunc('week', activity_date)::date as active_week
  from analytics.learner_activity
),
joined as (
  select c.cohort_week,
         c.user_id,
         ((aw.active_week - c.cohort_week) / 7)::int as week_n
  from cohorts c
  join activity_weeks aw
    on aw.user_id = c.user_id
   and aw.active_week >= c.cohort_week
),
sizes as (
  select cohort_week, count(*) as cohort_size
  from cohorts
  group by cohort_week
)
select s.cohort_week,
       s.cohort_size,
       j.week_n,
       count(distinct j.user_id)                                       as active,
       round(100.0 * count(distinct j.user_id) / s.cohort_size, 2)     as retention_pct
from sizes s
join joined j using (cohort_week)
group by s.cohort_week, s.cohort_size, j.week_n
order by s.cohort_week, j.week_n;

comment on view analytics.weekly_cohort_retention is
  'Weekly retention cohorts keyed on signup week. week_n=0 is the activation rate (signups active in their first week), not 100%. Long format for Metabase pivot: rows=cohort_week, cols=week_n, value=retention_pct.';

-- Default privileges in this schema already grant SELECT on new views to
-- metabase_readonly. Explicit grant as belt-and-suspenders in case Studio runs
-- this as a role other than the one that set those default privileges.
grant select on analytics.weekly_cohort_retention to metabase_readonly;
