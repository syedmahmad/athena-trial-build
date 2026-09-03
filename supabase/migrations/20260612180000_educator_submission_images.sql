-- Educator surface, phase 3: photo submissions.
--  * educator_submissions.images: array of storage paths (student photos of
--    handwritten work, attached on the share-link turn-in)
--  * private `educator-work` storage bucket — teacher views via short-lived
--    signed URLs minted server-side; nothing is publicly readable.
--
-- NOTE: apply via Supabase Studio SQL editor (db push is blocked by the
-- April 2026 migration drift).

ALTER TABLE public.educator_submissions ADD COLUMN images jsonb;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'educator-work',
  'educator-work',
  false,
  5242880, -- 5MB per object
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
-- No storage.objects policies on purpose: default-deny for anon/authed;
-- the service-role server client is the only reader/writer.
