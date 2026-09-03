-- ===========================================================
-- Infographics — one AI-generated poster per subtopic.
--
-- Mirrors `podcast_scripts`: the agents service authors a
-- structured `InfographicBrief` and a PNG via gpt-image-1; the
-- Next.js orchestrator (/api/infographic/[subtopicId]) uploads
-- the PNG to the `infographics` storage bucket and persists the
-- brief + public image URL here.
--
-- Shared across users: one subtopic = one poster, like
-- micro_lessons + podcast_scripts.
--
-- The Pydantic schema in agents/app/run_time/sat/infographic_agent.py
-- is the source of truth for the `brief` jsonb shape.
--
-- NOTE: Like other recent migrations, this must be applied via
-- the Supabase Studio SQL editor due to migration drift on the
-- remote (see memory: project_migration_drift_april2026.md).
-- Committed here for traceability.
-- ===========================================================

CREATE TABLE IF NOT EXISTS "infographics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subtopic_id" uuid NOT NULL,
	"brief" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"image_url" text,
	"status" text DEFAULT 'generating' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "infographics_subtopic_id_unique" UNIQUE ("subtopic_id")
);

ALTER TABLE "infographics"
	ADD CONSTRAINT "infographics_subtopic_id_subtopics_id_fk"
	FOREIGN KEY ("subtopic_id") REFERENCES "public"."subtopics"("id")
	ON DELETE cascade ON UPDATE no action;

-- Default-deny RLS. Reads/writes happen through service-role
-- server code (the Next.js orchestrator at
-- /api/infographic/[subtopicId]); there is no direct per-user
-- access pattern. Shared content, no per-user rows.
ALTER TABLE "infographics" ENABLE ROW LEVEL SECURITY;


-- ── Storage bucket ─────────────────────────────────────────────
-- Holds the rendered PNGs. Keyed by subtopic_id (one file per
-- subtopic; overwritten on regenerate). Public-read because the
-- art isn't sensitive — the route returns the public CDN URL and
-- the <img> tag fetches directly.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
	'infographics',
	'infographics',
	TRUE,
	8 * 1024 * 1024, -- 8 MiB; gpt-image-1 1024x1536 PNGs land 2-5 MiB
	ARRAY['image/png']
)
ON CONFLICT (id) DO UPDATE
	SET public = EXCLUDED.public,
		file_size_limit = EXCLUDED.file_size_limit,
		allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "infographics public read" ON storage.objects;
CREATE POLICY "infographics public read"
	ON storage.objects
	FOR SELECT
	USING (bucket_id = 'infographics');

-- Writes are performed only by the Next.js route using the
-- service-role key (bypasses RLS), so no INSERT/UPDATE policy.
