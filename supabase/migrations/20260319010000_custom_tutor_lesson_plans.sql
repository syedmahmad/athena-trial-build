create table if not exists custom_tutor_lesson_plans (
  id              uuid primary key default gen_random_uuid(),
  custom_topic_id uuid not null unique references custom_topics(id) on delete cascade,
  plan_content    jsonb not null default '{}'::jsonb,
  status          text not null default 'generating'
                    check (status in ('generating', 'ready', 'error')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists custom_tutor_lesson_plans_topic_id_idx
  on custom_tutor_lesson_plans(custom_topic_id);
