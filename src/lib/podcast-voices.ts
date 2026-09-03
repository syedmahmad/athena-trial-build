// Podcast voice configuration. The agent-authored script tags each
// dialogue line with a structural `speaker_id` (host_male / host_female
// / guest); this module maps those IDs to ElevenLabs voice IDs at
// playback time.
//
// The hosts are a fixed brand cast — same names + same voices across
// every podcast, so the audience builds recognition. Guests get a fresh
// voice per episode picked deterministically from a small pool, so
// re-listens reproduce the same voice for the same guest.
//
// Voice IDs are opaque ElevenLabs strings, not secrets. They live here
// rather than as env vars so swapping a voice is a single code change
// and a deploy — no Northflank coordination required.

export type PodcastSpeakerId = "host_male" | "host_female" | "guest";

// ElevenLabs model that honors inline audio tags ([Excited], [Soft], …).
// The /api/agent/text-to-speech route allowlists this model id; sending
// any other id falls back to the turbo default.
export const PODCAST_TTS_MODEL = "eleven_v3";

// Strip [Capitalized] audio tags from a script line so the transcript
// shows clean prose. The tags drive prosody, not visible text. Matches
// "[Word]" or "[Word Word]" with 2+ alphabetic chars inside; tolerates
// optional trailing whitespace so leading tags don't leave dangling
// spaces.
const AUDIO_TAG_PATTERN = /\[[A-Za-z][A-Za-z ]{1,30}\]\s*/g;
export function stripAudioTags(text: string): string {
  return text.replace(AUDIO_TAG_PATTERN, "").trim();
}

export type PodcastVoice = {
  voiceId: string;
  label: string;
};

// ── Brand cast ──────────────────────────────────────────────────────────
//
// Names MUST match what the agent emits in PodcastScript.speakers — see
// BRAND_HOST_MALE_NAME / BRAND_HOST_FEMALE_NAME in
// agents/app/run_time/sat/podcast_agent.py.

export const PODCAST_BRAND_CAST: {
  host_male: { name: string; voiceId: string };
  host_female: { name: string; voiceId: string };
} = {
  host_male: {
    name: "Marcus",
    voiceId: "Ifu36BnEjjIY932etsqk",
  },
  host_female: {
    name: "Lila",
    voiceId: "6u6JbqKdaQy89ENzLSju",
  },
};

// ── Guest pool ──────────────────────────────────────────────────────────
//
// One entry is picked per episode by deterministic hash on the script id
// so re-listens get the same guest voice. The agent's chosen guest name
// is preserved; only the voice is resolved here.

export const PODCAST_GUEST_VOICE_POOL: PodcastVoice[] = [
  // Belle — empathetic female.
  { voiceId: "cNYrMw9glwJZXR8RwbuR", label: "Belle" },
  // Archer — casual British male.
  { voiceId: "Fahco4VZzobUeiPqni1S", label: "Archer" },
];

// ── Resolution ──────────────────────────────────────────────────────────

/** Deterministic, stable across reloads. Same input → same output. */
function hashString(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Pick a guest voice from the pool, indexed by the script's stable id. */
export function resolveGuestVoice(scriptId: string): PodcastVoice {
  if (PODCAST_GUEST_VOICE_POOL.length === 0) {
    throw new Error("PODCAST_GUEST_VOICE_POOL is empty");
  }
  const idx = hashString(scriptId) % PODCAST_GUEST_VOICE_POOL.length;
  return PODCAST_GUEST_VOICE_POOL[idx]!;
}

/**
 * Map a speaker_id from the script to the ElevenLabs voice ID the
 * /api/agent/text-to-speech endpoint should use. The TTS route caches
 * results by hash(text, voiceId, ...), so stable voice IDs per speaker
 * mean re-listens cache-hit per line.
 */
export function voiceIdForSpeaker(
  speakerId: PodcastSpeakerId,
  scriptId: string,
): string {
  if (speakerId === "host_male") return PODCAST_BRAND_CAST.host_male.voiceId;
  if (speakerId === "host_female") return PODCAST_BRAND_CAST.host_female.voiceId;
  return resolveGuestVoice(scriptId).voiceId;
}

/** Display label for a speaker in the transcript panel. Falls back to
 *  the agent-authored name (which may be the guest's invented name). */
export function displayNameForSpeaker(
  speakerId: PodcastSpeakerId,
  agentAuthoredName: string,
): string {
  if (speakerId === "host_male") return PODCAST_BRAND_CAST.host_male.name;
  if (speakerId === "host_female") return PODCAST_BRAND_CAST.host_female.name;
  return agentAuthoredName;
}
