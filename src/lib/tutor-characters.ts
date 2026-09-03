// Tutor character + voice catalog. Each entry pairs a visual avatar
// with a recommended ElevenLabs voice — selecting a character also
// switches the voice unless the user picks a different one explicitly.
//
// Character sprites come from codex-pets.net and ship as 8×9 spritesheet
// WEBPs in public/tutor-characters/. The CodexPetSprite component
// animates them based on orb state (idle/speaking/listening/thinking).
//
// Voice IDs are intentionally placeholders until the user supplies the
// real ElevenLabs voice IDs from their dashboard.

export type TutorVoiceId = string;
export type TutorCharacterId =
  | "orb"
  | "einstein"
  | "cappy"
  | "rusty"
  | "patch-cat"
  | "froge";

export type TutorCharacter = {
  id: TutorCharacterId;
  label: string;
  /** Animated codex-pets spritesheet. Null for the "orb" baseline,
   *  which falls back to the built-in gradient sphere. */
  spritesheet: { src: string; cellWidth: number; cellHeight: number } | null;
  /** Optional credit displayed in the picker. */
  attribution?: string;
  /** Default voice for this character. Caller may override. Null →
   *  TTS endpoint falls back to ELEVENLABS_VOICE_ID env var. */
  defaultVoiceId: TutorVoiceId | null;
};

export type TutorVoice = {
  id: TutorVoiceId;
  label: string;
  /** Short blurb for picker preview. */
  description?: string;
};

/** Archer — the default Athena tutor voice. A casual British male
 *  ElevenLabs voice. The "default" sentinel resolves to this id (see
 *  resolveEffectiveVoiceId), so users who never pick a voice hear Archer. */
export const ARCHER_VOICE_ID = "Fahco4VZzobUeiPqni1S";

// All current codex-pets sprites share the canonical 192×208 cell size
// in an 8-col × 9-row atlas. Centralized so adding new pets is a
// one-line catalog change.
const CODEX_CELL = { cellWidth: 192, cellHeight: 208 };
const CODEX_ATTRIBUTION = "via codex-pets.net";

const ORB: TutorCharacter = {
  id: "orb",
  label: "Orb",
  spritesheet: null,
  defaultVoiceId: null,
};

export const TUTOR_CHARACTERS: TutorCharacter[] = [
  ORB,
  {
    id: "einstein",
    label: "Einstein",
    spritesheet: { src: "/tutor-characters/einstein.webp", ...CODEX_CELL },
    attribution: CODEX_ATTRIBUTION,
    defaultVoiceId: null,
  },
  {
    id: "cappy",
    label: "Cappy",
    spritesheet: { src: "/tutor-characters/cappy.webp", ...CODEX_CELL },
    attribution: CODEX_ATTRIBUTION,
    defaultVoiceId: null,
  },
  {
    id: "rusty",
    label: "Rusty",
    spritesheet: { src: "/tutor-characters/rusty.webp", ...CODEX_CELL },
    attribution: CODEX_ATTRIBUTION,
    defaultVoiceId: null,
  },
  {
    id: "patch-cat",
    label: "Patch Cat",
    spritesheet: { src: "/tutor-characters/patch-cat.webp", ...CODEX_CELL },
    attribution: CODEX_ATTRIBUTION,
    defaultVoiceId: null,
  },
  {
    id: "froge",
    label: "Froge",
    spritesheet: { src: "/tutor-characters/froge.webp", ...CODEX_CELL },
    attribution: CODEX_ATTRIBUTION,
    defaultVoiceId: null,
  },
];

/** Standalone voice options that aren't tied to a single character.
 *  The "default" sentinel resolves to Archer in resolveEffectiveVoiceId,
 *  so it IS the Archer voice — there's no separate Archer entry. */
export const TUTOR_VOICES: TutorVoice[] = [
  {
    id: "default",
    label: "Default (Archer)",
    description: "Casual British male — the default Athena tutor voice",
  },
  {
    id: "lxYfHSkYm1EzQzGhdbfc",
    label: "Jessica",
    description: "VoiceOver-pro female",
  },
  {
    id: "uIZsnBL0YK1S5j69bAih",
    label: "Belle",
    description: "Empathetic female",
  },
  {
    id: "qwaVDEGNsBllYcZO1ZOJ",
    label: "Brian",
    description: "Resonant male",
  },
];

export const DEFAULT_TUTOR_CHARACTER: TutorCharacterId = "orb";
export const DEFAULT_TUTOR_VOICE: TutorVoiceId = "default";

export const TUTOR_CHARACTER_STORAGE_KEY = "athena.tutorCharacter";
export const TUTOR_VOICE_STORAGE_KEY = "athena.tutorVoice";
/** Cookie name the TTS endpoint reads to apply the user's chosen voice
 *  without each client caller having to thread voiceId through. */
export const TUTOR_VOICE_COOKIE = "athena_voice";

const ALL_CHARACTER_IDS: readonly TutorCharacterId[] = [
  "orb",
  "einstein",
  "cappy",
  "rusty",
  "patch-cat",
  "froge",
];

export function isTutorCharacterId(value: unknown): value is TutorCharacterId {
  return (
    typeof value === "string" &&
    (ALL_CHARACTER_IDS as readonly string[]).includes(value)
  );
}

export function getTutorCharacter(id: TutorCharacterId): TutorCharacter {
  return TUTOR_CHARACTERS.find((c) => c.id === id) ?? ORB;
}

export function getTutorVoice(id: TutorVoiceId): TutorVoice | null {
  return TUTOR_VOICES.find((v) => v.id === id) ?? null;
}

/** "default" sentinel resolves to Archer — the default Athena tutor
 *  voice — so callers who never picked a voice (the vast majority) get
 *  Archer rather than the ELEVENLABS_VOICE_ID env fallback. Any other id
 *  is sent through to ElevenLabs as-is. */
export function resolveEffectiveVoiceId(voiceId: TutorVoiceId): string | null {
  if (!voiceId || voiceId === DEFAULT_TUTOR_VOICE) return ARCHER_VOICE_ID;
  return voiceId;
}
