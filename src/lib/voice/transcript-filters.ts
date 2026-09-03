/**
 * Filters for STT (Whisper / ElevenLabs Scribe) output.
 *
 * The hosted STT models hallucinate ambient-sound annotations on
 * silence or background noise — "(upbeat music playing)", "(coughs)",
 * "[Music]", "[BLANK_AUDIO]", "♪ humming ♪", etc. These are not real
 * speech and should never reach the chat agent.
 *
 * Two-stage approach:
 *   - `cleanTranscript(raw)`: strip every bracketed/marker group from
 *     the transcript, return what's left. Use this on the dispatch
 *     path so a real sentence with an embedded marker like
 *     "Add four to both sides (instrumental music plays)." reaches
 *     the matcher / chat as "Add four to both sides." Without the
 *     strip, the matcher gets confused by the parenthetical and the
 *     chat agent sees noise.
 *   - `isAmbientNoiseTranscript(raw)`: returns true when the whole
 *     transcript is ambient (nothing survives the strip, or what
 *     survives is just a known noise token / interjection class).
 *
 * Math content with parentheses ("solve (x + 4) = 7") is intentionally
 * NOT stripped — we only target the natural-language paren patterns
 * the STT model emits (music/silence/applause/etc.).
 */

/** Strip bracketed/marker groups produced by STT. Math parens like
 *  "(x + 4)" survive because they contain digits or math symbols that
 *  don't match the "natural-language ambient marker" heuristic. */
export function cleanTranscript(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  return t
    // Only strip parens that look like natural-language markers — letters
    // and optional spaces. "(x + 4)" stays because of the digit/symbol;
    // "(instrumental music plays)" / "(coughs)" / "(applause)" go.
    .replace(/\([a-z][a-z\s'-]*\)/gi, " ")
    .replace(/\[[a-z][a-z\s_'-]*\]/gi, " ")
    .replace(/♪[^♪]*♪/g, " ")
    .replace(/\*[a-z][a-z\s'-]*\*/gi, " ")
    // Collapse repeated whitespace introduced by the substitutions.
    .replace(/\s+/g, " ")
    .trim();
}

export function isAmbientNoiseTranscript(raw: string): boolean {
  const t = raw.trim();
  if (!t) return true;

  const stripped = cleanTranscript(t);

  if (stripped.length === 0) return true;

  // Even after stripping, sometimes the STT just emits a noise sentinel
  // like "BLANK_AUDIO" or "Music" with no surrounding brackets.
  const lower = stripped.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  const NOISE_TOKENS = new Set([
    "blank_audio",
    "blank audio",
    "music",
    "musics",
    "silence",
    "silent",
    "no audio",
    "applause",
    "laughter",
    "coughing",
    "coughs",
    "background noise",
    "ambient noise",
    "static",
    "humming",
    "breathing",
  ]);
  if (NOISE_TOKENS.has(lower)) return true;

  // If the surviving text is just a single non-word token (punctuation
  // residue), drop it too.
  if (!/[a-z0-9]/i.test(stripped)) return true;

  // Raw-noise interjection check: when the STT model doesn't tag a long
  // cough / throat-clear / nervous-noise with parens, it falls back to
  // transcribing the sound phonetically — "uh huh uh huh", "ahem ahem",
  // "oh oh oh", etc. If the WHOLE transcript decomposes into nothing
  // but tokens from this set, treat it as noise. Real student speech
  // always contains at least one content word that isn't on this list.
  //
  // Deliberately NOT including affirmatives ("yeah", "ok", "got it") —
  // those are handled by the close-intent detector at the dispatch site
  // and need to reach it.
  const INTERJECTION_TOKENS = new Set([
    "uh", "uhh", "uhhh", "uhhuh", "uhuh",
    "um", "umm", "ummm",
    "ah", "ahh", "ahhh", "aha",
    "ahem",
    "oh", "ohh", "ohhh", "ooh", "oof",
    "hmm", "hmmm", "mm", "mmm", "mhm", "mhmm",
    "huh",
    "ugh", "ughh",
    "achoo", "atchoo",
    "cough", "ack", "hack",
    // sound-imitation fillers STT occasionally produces during sustained
    // non-speech noise (breath, throat clearing, etc.)
    "shh", "shhh", "psh", "tsk",
  ]);
  const tokens = lower.split(/\s+/).filter(Boolean);
  if (tokens.length > 0 && tokens.every((t) => INTERJECTION_TOKENS.has(t))) {
    return true;
  }

  return false;
}
