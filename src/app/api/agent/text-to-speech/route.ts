import { createHash } from "node:crypto";
import { getAuthIdentity } from "@/lib/auth/current-user";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// ElevenLabs request shape is captured here so the cache key reflects every
// input that could affect the audio bytes. If you change any of these, the
// hash changes and prior cache entries are simply unreferenced (and will age
// out via storage cleanup, if/when configured).
const DEFAULT_MODEL_ID = "eleven_turbo_v2";
// Allowlist for the optional `modelId` body param. Podcasts opt into
// "eleven_v3" so inline audio tags ([Excited], [Soft], …) are parsed
// into prosody rather than spoken literally. Keep the allowlist tight
// — untrusted IDs go straight into the upstream URL otherwise.
const ALLOWED_MODELS: ReadonlySet<string> = new Set([
  "eleven_turbo_v2",
  "eleven_turbo_v2_5",
  "eleven_multilingual_v2",
  "eleven_flash_v2_5",
  "eleven_v3",
]);
const VOICE_SETTINGS = {
  // High stability dampens prosody variance so short interjections
  // ("That's right.") sit closer in tone to long descriptive narrations
  // instead of getting an excited/sharper delivery.
  stability: 0.75,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
} as const;

const CACHE_BUCKET = "tts-cache";

const VOICE_COOKIE_NAME = "athena_voice";

/** Pulls the user's chosen voice from the request cookie. Returns null
 *  when absent so the caller can fall through to the env default. */
function readVoiceCookie(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === VOICE_COOKIE_NAME) {
      try {
        return decodeURIComponent(rest.join("=")) || null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

let _admin: SupabaseClient | null = null;
function getStorageAdmin(): SupabaseClient | null {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

/** SHA-256 hex of every input that affects the output audio. */
function cacheKey(text: string, voiceId: string, modelId: string): string {
  const canonical = JSON.stringify({
    text,
    voice_id: voiceId,
    model_id: modelId,
    voice_settings: VOICE_SETTINGS,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

async function cachedPublicUrl(hash: string): Promise<string | null> {
  const admin = getStorageAdmin();
  if (!admin) return null;
  // The bucket is public, so getPublicUrl just builds the deterministic URL —
  // it does NOT verify the object exists. We confirm with a 1-byte Range GET
  // (206 on hit, 404 on miss). Range responses are CDN-cacheable on Supabase
  // Storage's Cloudflare edge while HEAD is not — so warm objects skip the
  // origin entirely on existence checks.
  const { data } = admin.storage.from(CACHE_BUCKET).getPublicUrl(`${hash}.mp3`);
  const publicUrl = data.publicUrl;
  try {
    const probe = await fetch(publicUrl, { headers: { Range: "bytes=0-0" } });
    // Drain the (1-byte) body so the connection can be reused.
    await probe.arrayBuffer();
    return probe.ok ? publicUrl : null;
  } catch {
    return null;
  }
}

async function writeCache(hash: string, audio: ArrayBuffer): Promise<void> {
  const admin = getStorageAdmin();
  if (!admin) return;
  const { error } = await admin.storage
    .from(CACHE_BUCKET)
    .upload(`${hash}.mp3`, new Uint8Array(audio), {
      contentType: "audio/mpeg",
      // Two concurrent misses for the same text would race; upsert lets the
      // second writer win harmlessly since identical inputs produce identical
      // bytes for the same hash.
      upsert: true,
      cacheControl: "31536000, public, immutable",
    });
  if (error) {
    console.error("TTS cache upload failed:", error.message);
  }
}

export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const envVoiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !envVoiceId) {
    return NextResponse.json(
      { error: "ElevenLabs not configured" },
      { status: 500 }
    );
  }

  try {
    const body = (await req.json()) as {
      text: string;
      voiceId?: string;
      modelId?: string;
    };
    const text = body.text;
    if (!text) {
      return NextResponse.json(
        { error: "No text provided" },
        { status: 400 }
      );
    }

    // Resolution order: per-call override (body.voiceId) → user's
    // chosen voice (athena_voice cookie set by TutorCharacterProvider)
    // → env default. Each accepts only alphanumeric ids (ElevenLabs
    // format) to keep untrusted input out of the upstream URL.
    const cookieVoiceId = readVoiceCookie(req);
    const candidate = body.voiceId ?? cookieVoiceId ?? envVoiceId;
    const voiceId = /^[A-Za-z0-9]{8,64}$/.test(candidate)
      ? candidate
      : envVoiceId;

    // Resolve TTS model. Default is the low-latency turbo model; podcast
    // callers opt into eleven_v3 so inline audio tags get interpreted.
    const requestedModel = body.modelId;
    const modelId =
      requestedModel && ALLOWED_MODELS.has(requestedModel)
        ? requestedModel
        : DEFAULT_MODEL_ID;

    // ── Cache lookup ──
    // If storage admin creds aren't present (e.g. local dev without
    // SUPABASE_SERVICE_ROLE_KEY) the lookup returns null and we transparently
    // fall through to the live ElevenLabs call. Same on bucket misses or
    // storage transport errors — the cache is best-effort.
    const hash = cacheKey(text, voiceId, modelId);
    const hit = await cachedPublicUrl(hash);
    if (hit) {
      // 302: browser fetch follows transparently, audio bytes come from the
      // Supabase storage CDN (which sets its own long Cache-Control), so the
      // function exits in single-digit ms on hits.
      return NextResponse.redirect(hit, 302);
    }

    // ── Cache miss → ElevenLabs ──
    // Retry transient upstream failures (5xx, 429) once with a brief
    // backoff. ElevenLabs intermittently 503s under load; one retry
    // covers most of those. Auth/quota errors (401, 403) skip the
    // retry — those don't recover by trying again.
    const callOnce = () =>
      fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: VOICE_SETTINGS,
        }),
      });

    let res = await callOnce();
    if (!res.ok && (res.status >= 500 || res.status === 429)) {
      await new Promise((r) => setTimeout(r, 400));
      res = await callOnce();
    }

    if (!res.ok) {
      const body = await res.text();
      console.error(`ElevenLabs TTS error ${res.status}:`, body);
      // Surface a stable error code to the client without leaking
      // upstream-internal details (billing thresholds, credit
      // accounting, etc.). Code maps to a known set the UI can
      // localize/handle; full body stays in the server log.
      let code: "quota_exceeded" | "rate_limited" | "auth" | "upstream" = "upstream";
      if (res.status === 429) code = "rate_limited";
      else if (res.status === 401 || res.status === 403) {
        try {
          const parsed = JSON.parse(body) as {
            detail?: { status?: string };
          };
          if (parsed.detail?.status === "quota_exceeded") code = "quota_exceeded";
          else code = "auth";
        } catch {
          code = "auth";
        }
      }
      return NextResponse.json(
        { error: "Text-to-speech failed", code },
        { status: 503 }
      );
    }

    const audioBuffer = await res.arrayBuffer();

    // Write the freshly-generated audio to the cache, but don't block the
    // response on it — the user already paid the ElevenLabs latency, no need
    // to also wait for an S3 round-trip. The next caller for this hash will
    // either get the cached URL (if the write finished) or pay ElevenLabs
    // again (if the write hasn't landed yet); either way correctness holds.
    void writeCache(hash, audioBuffer);

    return new NextResponse(audioBuffer, {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (err) {
    console.error("TTS route error:", err);
    return NextResponse.json(
      { error: "Text-to-speech failed" },
      { status: 503 }
    );
  }
}
