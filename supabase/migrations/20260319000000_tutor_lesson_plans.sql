-- AI-generated tutor lesson plans per subtopic.
-- Stores the structured LessonPlan JSON for on-demand AI tutor sessions.

create table if not exists tutor_lesson_plans (
  id            uuid primary key default gen_random_uuid(),
  subtopic_id   uuid not null unique references subtopics(id) on delete cascade,
  plan_content  jsonb not null default '{}'::jsonb,
  status        text not null default 'generating'
                  check (status in ('generating', 'ready', 'error')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists tutor_lesson_plans_subtopic_id_idx
  on tutor_lesson_plans(subtopic_id);
