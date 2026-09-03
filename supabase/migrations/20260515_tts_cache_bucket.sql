-- TTS audio cache.
--
-- The /api/agent/text-to-speech route hashes (text, voice_id, model_id,
-- voice_settings) and looks up the resulting MP3 in this bucket before
-- calling ElevenLabs. On a cache miss the route uploads the MP3 here so
-- the next caller is free. Bucket is public-read because the audio isn't
-- sensitive (it's the same narration we ship to every student) and serving
-- via the storage public URL lets the route 302-redirect instead of
-- proxying the bytes.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tts-cache',
  'tts-cache',
  TRUE,
  10 * 1024 * 1024, -- 10 MiB; ElevenLabs eleven_turbo_v2 outputs well under this
  ARRAY['audio/mpeg']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Anyone can read cached MP3s (the route 302s to the public URL).
DROP POLICY IF EXISTS "tts-cache public read" ON storage.objects;
CREATE POLICY "tts-cache public read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'tts-cache');

-- Writes are performed only by the route using the service-role key, which
-- bypasses RLS, so no INSERT/UPDATE policy is needed.
