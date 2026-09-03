-- =============================================================================
-- Billing analytics  —  data capture + standard SaaS-metric layer
-- =============================================================================
-- Extends the Stripe billing slice (20260617120000_billing_stripe.sql) so the
-- analytics schema can compute the full standard SaaS metric suite: MRR / ARR,
-- ARPU, active subscribers, MRR movement (new / expansion / contraction /
-- churned / reactivation), gross & net MRR churn (NRR), logo churn, LTV, trial
-- conversion, the quick ratio, and subscriber cohort retention.
--
-- WHY THIS MIGRATION EXISTS:
--   Phase-1 billing only mirrored the CURRENT subscription_status onto the user
--   row — no price, no interval, no event history. That is enough to gate
--   access but cannot express revenue (no amount) or movement (no history).
--   This migration adds:
--     1. price/interval/lifecycle columns on public.users (current MRR),
--     2. public.billing_events — an append-only event log written by the Stripe
--        webhook (powers churn / MRR movement / cohorts going forward),
--     3. analytics.subscription_snapshots — a daily point-in-time copy of active
--        subscriptions + MRR (historical MRR/active trend lines), mirroring the
--        subsection_skill_snapshots pattern,
--     4. the analytics.* views Metabase reads.
--
--   Like the mastery snapshots, billing history CANNOT be backfilled from local
--   state — Stripe holds the full history, but locally every event before the
--   webhook started logging is lost. Movement/cohort views fill in from the day
--   the webhook ships; current-state views (MRR, ARPU, active) work immediately.
--
-- HOW TO APPLY:
--   `supabase db push` is blocked by remote/local drift, so run this in the
--   Supabase SQL Editor (Studio), which runs as `postgres` — the owner the
--   RLS-bypass property of the analytics views depends on. The whole file is
--   idempotent and can be re-run.
--
-- MRR NORMALIZATION:
--   MRR is always normalized to a MONTHLY figure. A yearly plan contributes
--   amount/12. Trialing subscriptions contribute $0 MRR (no revenue yet) but
--   still count in the trial funnel. ARR = MRR * 12.
-- =============================================================================

-- =============================================================================
-- 1. public.users — billing columns needed for revenue math
-- -----------------------------------------------------------------------------
-- subscription_status already exists (phase 1). These add the price/interval and
-- lifecycle timestamps the webhook can now persist from the Stripe subscription.
-- =============================================================================

alter table public.users add column if not exists subscription_plan               text;        -- lookup_key, e.g. family_monthly
alter table public.users add column if not exists subscription_interval           text;        -- 'month' | 'year'
alter table public.users add column if not exists subscription_amount_cents       integer;     -- price per interval, in cents
alter table public.users add column if not exists subscription_current_period_end timestamptz; -- renewal / lapse boundary
alter table public.users add column if not exists subscription_started_at         timestamptz; -- first time the sub became active/trialing
alter table public.users add column if not exists subscription_canceled_at        timestamptz; -- when it most recently lapsed (canceled/unpaid)

comment on column public.users.subscription_amount_cents is
  'Price charged per billing interval, in cents. Monthly plan = MRR; yearly plan MRR = amount/12.';

-- =============================================================================
-- 2. public.billing_events — append-only subscription event log
-- -----------------------------------------------------------------------------
-- The Stripe webhook appends one row per processed subscription event. Idempotent
-- on stripe_event_id (Stripe retries the same event id). This is the source of
-- truth for MRR movement, churn, reactivation, and subscriber cohorts. It is
-- never updated or deleted — purely append-only history.
-- =============================================================================

create table if not exists public.billing_events (
  id                     uuid primary key default gen_random_uuid(),
  stripe_event_id        text unique,                 -- idempotency key (Stripe event.id)
  user_id                uuid references public.users(id) on delete set null,
  stripe_customer_id     text,
  stripe_subscription_id text,
  event_type             text not null,               -- Stripe event.type
  status                 text,                         -- subscription status AFTER this event
  plan                   text,                         -- lookup_key
  interval               text,                         -- 'month' | 'year'
  amount_cents           integer,                      -- price per interval, cents
  mrr_cents              integer,                      -- normalized monthly revenue this event represents (0 if not revenue-bearing)
  occurred_at            timestamptz not null,         -- Stripe event.created
  created_at             timestamptz not null default now()
);

comment on table public.billing_events is
  'Append-only Stripe subscription event log written by the webhook. Powers MRR movement, churn, reactivation, and subscriber cohorts. Not backfillable — history starts when the webhook began logging.';

create index if not exists billing_events_customer_idx     on public.billing_events (stripe_customer_id);
create index if not exists billing_events_subscription_idx on public.billing_events (stripe_subscription_id, occurred_at);
create index if not exists billing_events_occurred_idx     on public.billing_events (occurred_at);

-- RLS-everywhere posture: enable RLS, default-deny. The service-role key (server
-- code / webhook) bypasses RLS so writes keep working; anon/authenticated get
-- nothing. Metabase reads through the postgres-owned analytics views (which also
-- bypass RLS), never this table directly.
alter table public.billing_events enable row level security;

-- =============================================================================
-- 3. analytics — subscription dimension + current-state revenue
-- -----------------------------------------------------------------------------
-- One row per user that has ever reached checkout. active_mrr_cents is the
-- revenue-bearing MRR (active/past_due count; trialing/canceled = 0).
-- =============================================================================

create or replace view analytics.subscriptions as
select
  u.id                              as user_id,
  u.email,
  u.stripe_customer_id,
  u.stripe_subscription_id,
  u.subscription_status             as status,
  u.subscription_plan               as plan,
  u.subscription_interval           as interval,
  u.subscription_amount_cents       as amount_cents,
  -- Normalize to a monthly figure regardless of billing interval.
  case u.subscription_interval
    when 'year'  then round(u.subscription_amount_cents / 12.0)::int
    when 'month' then u.subscription_amount_cents
    else u.subscription_amount_cents
  end                               as mrr_cents,
  -- Revenue-bearing MRR: trials and lapsed subs contribute $0.
  case
    when u.subscription_status in ('active', 'past_due') then
      case u.subscription_interval
        when 'year'  then round(u.subscription_amount_cents / 12.0)::int
        when 'month' then u.subscription_amount_cents
        else u.subscription_amount_cents
      end
    else 0
  end                               as active_mrr_cents,
  (u.subscription_status in ('active', 'past_due', 'trialing')) as is_active,
  (u.subscription_status in ('active', 'past_due'))             as is_paying,
  (u.subscription_status = 'trialing')                          as is_trialing,
  u.subscription_started_at,
  u.subscription_canceled_at,
  u.subscription_current_period_end,
  u.created_at                      as user_created_at
from public.users u
where u.stripe_customer_id is not null;

-- Passthrough of the raw event log for Metabase (postgres-owned => bypasses RLS).
create or replace view analytics.billing_events as
select
  e.id,
  e.stripe_event_id,
  e.user_id,
  e.stripe_customer_id,
  e.stripe_subscription_id,
  e.event_type,
  e.status,
  e.plan,
  e.interval,
  e.amount_cents,
  e.mrr_cents,
  e.occurred_at,
  e.occurred_at::date            as occurred_date,
  date_trunc('month', e.occurred_at)::date as occurred_month,
  e.created_at
from public.billing_events e;

-- =============================================================================
-- 4. CURRENT-STATE METRICS  (✅ computable immediately)
-- =============================================================================

-- Headline numbers: MRR, ARR, paying customers, ARPU, trials.
create or replace view analytics.mrr_summary as
select
  count(*) filter (where is_paying)                       as paying_customers,
  count(*) filter (where is_trialing)                     as trialing_customers,
  count(*) filter (where is_active)                       as active_customers,
  coalesce(sum(active_mrr_cents), 0) / 100.0              as mrr,
  coalesce(sum(active_mrr_cents), 0) * 12 / 100.0         as arr,
  round(
    coalesce(sum(active_mrr_cents), 0)
    / nullif(count(*) filter (where is_paying), 0) / 100.0
  , 2)                                                    as arpu,
  round(
    coalesce(avg(active_mrr_cents) filter (where is_paying), 0) / 100.0
  , 2)                                                    as avg_revenue_per_paying_user
from analytics.subscriptions;

-- MRR / customers broken out by plan + interval.
create or replace view analytics.mrr_by_plan as
select
  coalesce(plan, 'unknown')                       as plan,
  coalesce(interval, 'unknown')                   as interval,
  count(*) filter (where is_paying)               as paying_customers,
  count(*) filter (where is_trialing)             as trialing_customers,
  coalesce(sum(active_mrr_cents), 0) / 100.0      as mrr,
  coalesce(sum(active_mrr_cents), 0) * 12 / 100.0 as arr
from analytics.subscriptions
group by 1, 2;

-- Subscription status distribution (active / trialing / past_due / canceled / …).
create or replace view analytics.subscription_status_breakdown as
select
  coalesce(status, 'none')                         as status,
  count(*)                                         as customers,
  round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 1) as pct_of_customers
from analytics.subscriptions
group by 1;

-- =============================================================================
-- 5. DAILY SNAPSHOT  (time-critical — captures the MRR/active LEVEL each day)
-- -----------------------------------------------------------------------------
-- Mirrors analytics.subsection_skill_snapshots. The event log (section 6) gives
-- MOVEMENT; this gives the standing LEVEL, so trend lines don't depend on
-- replaying every event. One row per day.
-- =============================================================================

create table if not exists analytics.subscription_snapshots (
  snapshot_date       date primary key,
  paying_customers    integer,
  trialing_customers  integer,
  active_customers    integer,
  mrr_cents           bigint,                 -- revenue-bearing MRR, cents
  arr_cents           bigint,
  captured_at         timestamptz not null default now()
);

comment on table analytics.subscription_snapshots is
  'Daily point-in-time MRR + active/trialing/paying customer counts. Powers historical MRR & subscriber trend lines. Backfill impossible — every missed day is lost.';

create or replace function analytics.snapshot_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public, analytics
as $$
declare
  n integer;
begin
  insert into analytics.subscription_snapshots (
    snapshot_date, paying_customers, trialing_customers, active_customers, mrr_cents, arr_cents
  )
  select
    current_date,
    count(*) filter (where is_paying),
    count(*) filter (where is_trialing),
    count(*) filter (where is_active),
    coalesce(sum(active_mrr_cents), 0),
    coalesce(sum(active_mrr_cents), 0) * 12
  from analytics.subscriptions
  on conflict (snapshot_date) do update set
    paying_customers   = excluded.paying_customers,
    trialing_customers = excluded.trialing_customers,
    active_customers   = excluded.active_customers,
    mrr_cents          = excluded.mrr_cents,
    arr_cents          = excluded.arr_cents,
    captured_at        = now();

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function analytics.snapshot_subscriptions() is
  'Upserts today''s row into subscription_snapshots. Idempotent within a day. Schedule nightly via pg_cron.';

-- Seed a day-0 snapshot.
select analytics.snapshot_subscriptions();

-- Nightly schedule (07:15 UTC, just after the skills snapshot at 07:10).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'analytics-daily-subscription-snapshot',
      '15 7 * * *',
      $cron$ select analytics.snapshot_subscriptions(); $cron$
    );
    raise notice 'pg_cron job ''analytics-daily-subscription-snapshot'' scheduled.';
  else
    raise notice 'pg_cron NOT enabled: subscription snapshot will not auto-run. Enable pg_cron and re-run this block, or call analytics.snapshot_subscriptions() from an external nightly job.';
  end if;
end;
$$;

-- Daily MRR / ARR / subscriber trend from the snapshots.
create or replace view analytics.mrr_daily as
select
  snapshot_date,
  paying_customers,
  trialing_customers,
  active_customers,
  mrr_cents / 100.0           as mrr,
  arr_cents / 100.0           as arr,
  round(mrr_cents
        / nullif(paying_customers, 0) / 100.0, 2) as arpu
from analytics.subscription_snapshots;

-- Month-over-month MRR growth from the last snapshot of each month.
create or replace view analytics.mrr_monthly as
with monthly as (
  select distinct on (date_trunc('month', snapshot_date))
    date_trunc('month', snapshot_date)::date as month,
    mrr_cents,
    paying_customers
  from analytics.subscription_snapshots
  order by date_trunc('month', snapshot_date), snapshot_date desc
)
select
  month,
  mrr_cents / 100.0                                            as mrr,
  paying_customers,
  (mrr_cents - lag(mrr_cents) over (order by month)) / 100.0   as mrr_change,
  round(100.0 * (mrr_cents - lag(mrr_cents) over (order by month))
        / nullif(lag(mrr_cents) over (order by month), 0), 1)  as mrr_growth_pct
from monthly;

-- =============================================================================
-- 6. MRR MOVEMENT + CHURN  (from the event log — fills in as events accrue)
-- -----------------------------------------------------------------------------
-- For each subscription we walk its events in time order and diff the
-- revenue-bearing MRR to classify each transition as new / expansion /
-- contraction / churned / reactivation.
-- =============================================================================

-- Per-event movement, classified. active_mrr counts active/past_due only.
create or replace view analytics.mrr_movement_events as
with ev as (
  select
    e.*,
    case when e.status in ('active', 'past_due') then coalesce(e.mrr_cents, 0) else 0 end as active_mrr,
    row_number() over (partition by e.stripe_subscription_id order by e.occurred_at, e.created_at) as seq
  from public.billing_events e
  where e.stripe_subscription_id is not null
),
diffed as (
  select
    ev.*,
    lag(active_mrr) over (partition by stripe_subscription_id order by seq) as prev_active_mrr,
    -- Did this subscription ever bill before this event? (reactivation vs new)
    max(case when active_mrr > 0 then 1 else 0 end)
      over (partition by stripe_subscription_id order by seq
            rows between unbounded preceding and 1 preceding) as billed_before
  from ev
)
select
  id,
  stripe_event_id,
  user_id,
  stripe_subscription_id,
  occurred_at,
  occurred_at::date                          as occurred_date,
  date_trunc('month', occurred_at)::date     as occurred_month,
  status,
  plan,
  coalesce(prev_active_mrr, 0)               as prev_active_mrr_cents,
  active_mrr                                 as active_mrr_cents,
  (active_mrr - coalesce(prev_active_mrr, 0)) as delta_mrr_cents,
  case
    when coalesce(prev_active_mrr, 0) = 0 and active_mrr > 0 and coalesce(billed_before, 0) = 0 then 'new'
    when coalesce(prev_active_mrr, 0) = 0 and active_mrr > 0 and billed_before = 1           then 'reactivation'
    when prev_active_mrr > 0 and active_mrr > prev_active_mrr                                 then 'expansion'
    when prev_active_mrr > 0 and active_mrr > 0 and active_mrr < prev_active_mrr              then 'contraction'
    when prev_active_mrr > 0 and active_mrr = 0                                               then 'churn'
    else 'no_change'
  end                                        as movement_type
from diffed;

-- Monthly MRR movement waterfall: new / expansion / contraction / churned / reactivation.
create or replace view analytics.mrr_movement_monthly as
select
  occurred_month                                                                          as month,
  coalesce(sum(delta_mrr_cents) filter (where movement_type = 'new'), 0)          / 100.0 as new_mrr,
  coalesce(sum(delta_mrr_cents) filter (where movement_type = 'reactivation'), 0) / 100.0 as reactivation_mrr,
  coalesce(sum(delta_mrr_cents) filter (where movement_type = 'expansion'), 0)    / 100.0 as expansion_mrr,
  coalesce(sum(delta_mrr_cents) filter (where movement_type = 'contraction'), 0)  / 100.0 as contraction_mrr,
  coalesce(sum(delta_mrr_cents) filter (where movement_type = 'churn'), 0)        / 100.0 as churned_mrr,
  coalesce(sum(delta_mrr_cents), 0)                                               / 100.0 as net_new_mrr,
  count(*) filter (where movement_type = 'new')                                  as new_customers,
  count(*) filter (where movement_type = 'reactivation')                         as reactivated_customers,
  count(*) filter (where movement_type = 'churn')                                as churned_customers
from analytics.mrr_movement_events
where movement_type <> 'no_change'
group by occurred_month;

-- Monthly churn + retention rates. Gross MRR churn, net MRR churn (=NRR basis),
-- logo (customer) churn. Denominator = MRR at the start of the month (prior
-- month-end snapshot); falls back gracefully when snapshots are sparse.
create or replace view analytics.churn_monthly as
with mv as (
  select * from analytics.mrr_movement_monthly
),
base as (
  -- MRR at start of month = last snapshot strictly before the month.
  select
    mv.month,
    (select s.mrr_cents
       from analytics.subscription_snapshots s
      where s.snapshot_date < mv.month
      order by s.snapshot_date desc
      limit 1) / 100.0                                                  as starting_mrr,
    (select s.paying_customers
       from analytics.subscription_snapshots s
      where s.snapshot_date < mv.month
      order by s.snapshot_date desc
      limit 1)                                                          as starting_customers
  from mv
)
select
  mv.month,
  base.starting_mrr,
  base.starting_customers,
  mv.churned_mrr,
  mv.contraction_mrr,
  mv.expansion_mrr,
  mv.churned_customers,
  -- Gross MRR churn rate = churned MRR / starting MRR.
  round(100.0 * abs(mv.churned_mrr) / nullif(base.starting_mrr, 0), 1)            as gross_mrr_churn_pct,
  -- Net MRR churn rate = (churned + contraction − expansion) / starting MRR.
  round(100.0 * (abs(mv.churned_mrr) + abs(mv.contraction_mrr) - mv.expansion_mrr)
        / nullif(base.starting_mrr, 0), 1)                                        as net_mrr_churn_pct,
  -- Net Revenue Retention = (starting + expansion − contraction − churned) / starting.
  round(100.0 * (base.starting_mrr + mv.expansion_mrr - abs(mv.contraction_mrr) - abs(mv.churned_mrr))
        / nullif(base.starting_mrr, 0), 1)                                        as net_revenue_retention_pct,
  -- Logo / customer churn rate.
  round(100.0 * mv.churned_customers / nullif(base.starting_customers, 0), 1)     as logo_churn_pct
from mv
left join base on base.month = mv.month;

-- =============================================================================
-- 7. LTV, TRIAL CONVERSION, QUICK RATIO, COHORTS
-- =============================================================================

-- Customer lifetime value. LTV = ARPU / monthly logo churn rate (averaged over
-- the trailing periods we have). With sparse early data, churn can be 0 → LTV is
-- null (undefined), which is correct, not infinite.
create or replace view analytics.ltv as
with churn as (
  select avg(logo_churn_pct) / 100.0 as avg_monthly_logo_churn
  from analytics.churn_monthly
  where logo_churn_pct is not null
),
arpu as (
  select arpu from analytics.mrr_summary
)
select
  arpu.arpu                                                            as arpu,
  round((churn.avg_monthly_logo_churn * 100)::numeric, 2)              as avg_monthly_churn_pct,
  case
    when churn.avg_monthly_logo_churn > 0
    then round((arpu.arpu / churn.avg_monthly_logo_churn)::numeric, 2)
    else null
  end                                                                  as ltv,
  case
    when churn.avg_monthly_logo_churn > 0
    then round((1.0 / churn.avg_monthly_logo_churn)::numeric, 1)
    else null
  end                                                                  as avg_lifetime_months
from arpu, churn;

-- Trial funnel + conversion. A trial = a user given a trial_ends_at window. A
-- conversion = that user reaching a paid (active/past_due) subscription. Cohorted
-- by signup month.
create or replace view analytics.trial_conversion_monthly as
with trials as (
  select
    u.id,
    date_trunc('month', u.created_at)::date as cohort_month,
    (u.trial_ends_at is not null)           as started_trial,
    (u.subscription_started_at is not null
      or u.subscription_status in ('active', 'past_due')) as converted
  from public.users u
  where u.trial_ends_at is not null
)
select
  cohort_month,
  count(*)                                         as trials_started,
  count(*) filter (where converted)                as converted,
  round(100.0 * count(*) filter (where converted)
        / nullif(count(*), 0), 1)                  as conversion_pct
from trials
group by cohort_month;

-- Overall trial conversion (single number).
create or replace view analytics.trial_conversion as
select
  count(*) filter (where trial_ends_at is not null)                                  as trials_started,
  count(*) filter (where trial_ends_at is not null
                     and (subscription_started_at is not null
                          or subscription_status in ('active','past_due')))          as converted,
  round(100.0 * count(*) filter (where trial_ends_at is not null
                     and (subscription_started_at is not null
                          or subscription_status in ('active','past_due')))
        / nullif(count(*) filter (where trial_ends_at is not null), 0), 1)           as conversion_pct
from public.users;

-- The Quick Ratio = (new + expansion + reactivation) / (churned + contraction).
-- A healthy SaaS is > 4. Per month.
create or replace view analytics.quick_ratio_monthly as
select
  month,
  round(
    (new_mrr + expansion_mrr + reactivation_mrr)
    / nullif(abs(churned_mrr) + abs(contraction_mrr), 0)
  , 2) as quick_ratio
from analytics.mrr_movement_monthly;

-- Subscriber cohort retention: cohort = month a customer first started paying
-- (from billing_events). For each later month, are they still paying? Long format
-- so Metabase can pivot it (months_since × cohort_month).
create or replace view analytics.subscriber_cohorts as
with first_paid as (
  select
    stripe_subscription_id,
    user_id,
    date_trunc('month', min(occurred_at))::date as cohort_month
  from public.billing_events
  where status in ('active', 'past_due')
  group by stripe_subscription_id, user_id
),
-- Months in which each subscription was paying.
active_months as (
  select distinct
    stripe_subscription_id,
    date_trunc('month', occurred_at)::date as active_month
  from public.billing_events
  where status in ('active', 'past_due')
),
cohort_sizes as (
  select cohort_month, count(*) as cohort_size
  from first_paid
  group by cohort_month
)
select
  fp.cohort_month,
  cs.cohort_size,
  (extract(year  from am.active_month) - extract(year  from fp.cohort_month)) * 12
  + (extract(month from am.active_month) - extract(month from fp.cohort_month))      as months_since,
  count(distinct fp.stripe_subscription_id)                                          as retained,
  round(100.0 * count(distinct fp.stripe_subscription_id)
        / nullif(cs.cohort_size, 0), 1)                                              as retention_pct
from first_paid fp
join active_months am on am.stripe_subscription_id = fp.stripe_subscription_id
join cohort_sizes cs   on cs.cohort_month = fp.cohort_month
group by fp.cohort_month, cs.cohort_size,
         (extract(year from am.active_month) - extract(year from fp.cohort_month)) * 12
         + (extract(month from am.active_month) - extract(month from fp.cohort_month));

-- =============================================================================
-- 8. GRANTS  (metabase_readonly — analytics-only reader from 20260528...)
-- -----------------------------------------------------------------------------
-- Views/tables created by postgres in `analytics` are auto-granted to
-- metabase_readonly via ALTER DEFAULT PRIVILEGES (set in the original layer), but
-- re-grant explicitly so a re-run on an existing DB is self-contained. The new
-- RLS table also needs a SELECT policy for the reader.
-- =============================================================================

grant usage  on schema analytics to metabase_readonly;
grant select on all tables in schema analytics to metabase_readonly;          -- includes the new views
grant execute on function analytics.snapshot_subscriptions() to metabase_readonly;

alter table analytics.subscription_snapshots enable row level security;
drop policy if exists "metabase_readonly reads subscription snapshots" on analytics.subscription_snapshots;
create policy "metabase_readonly reads subscription snapshots"
  on analytics.subscription_snapshots
  for select to metabase_readonly using (true);

-- public.billing_events stays default-deny under RLS; metabase never touches it
-- directly (it reads analytics.billing_events, a postgres-owned view). No policy
-- needed — anon/authenticated correctly see nothing, the service role bypasses RLS.
