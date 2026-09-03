-- Excalidraw-based lessons (MCP-powered)
-- Stores the accumulated Excalidraw element set + lesson text per subtopic.

create table if not exists excalidraw_lessons (
  id            uuid primary key default gen_random_uuid(),
  subtopic_id   uuid not null unique references subtopics(id) on delete cascade,
  lesson_content text not null default '',
  elements      jsonb not null default '[]'::jsonb,
  checkpoint_id text,
  status        text not null default 'generating'
                  check (status in ('generating', 'ready', 'error')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists excalidraw_lessons_subtopic_id_idx
  on excalidraw_lessons(subtopic_id);
