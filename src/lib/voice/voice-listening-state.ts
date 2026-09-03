/**
 * Voice listening state machine — the single source of truth for
 * what VAD thresholds to apply at any moment.
 *
 * THE PROBLEM THIS SOLVES:
 *
 * The voice-activity hook has two competing requirements:
 *   - Short answers ("B", "yes", "five") need minSpeechMs ≈ 140ms
 *     so they're not filtered as misfires.
 *   - Tutor TTS bleeding through the speakers needs minSpeechMs ≈
 *     400ms so the tutor's own voice doesn't trip speech-real-start.
 *
 * Picking the wrong threshold causes either: short answers vanish,
 * OR the tutor cancels its own TTS. The bug kept regressing because
 * the threshold was gated by AND'ing many boolean flags at the call
 * site — every new flag (chat.isProcessing, isChatting, etc.) had
 * to be remembered in every gate, and forgetting one reopened the
 * loop.
 *
 * Architecture: the consumer no longer chooses a threshold or
 * AND's flags. It describes the current phase as a tagged union
 * value, and the hook maps phase → threshold. Adding a new phase
 * requires updating `thresholdsForListeningState`, which is
 * exhaustiveness-checked via a `never` assertion so the type system
 * refuses to compile a missing case.
 *
 * The derive function is pure and unit-tested — see
 * `src/__tests__/voice-listening-state.test.ts`.
 */

/**
 * Mutually exclusive listening phases. EXACTLY ONE at a time.
 * Each maps to a single threshold profile.
 */
export type VoiceListeningState =
  | { phase: "off" }                   // mic muted / stopped / pre-init
  | { phase: "idle" }                  // nothing happening — mic warm, no tutor, no interaction
  | { phase: "lesson-teaching" }       // lesson TTS is playing or about to play
  | { phase: "chat-active" }           // any chat signal — takeover, free chat, in-flight stream
  | { phase: "interaction-awaiting" }; // student is up for an answer; ONLY phase that lowers threshold

export type VoiceListeningThresholds = {
  minSpeechMs: number;
  redemptionMs: number;
};

/**
 * Maps a listening phase to its VAD thresholds. The default branch
 * is reachable only if a new phase was added to VoiceListeningState
 * without a matching case here — the `never` assignment refuses to
 * compile in that scenario, forcing the threshold decision to be
 * made consciously.
 */
export function thresholdsForListeningState(
  state: VoiceListeningState,
): VoiceListeningThresholds {
  switch (state.phase) {
    case "interaction-awaiting":
      // The ONLY phase that lowers the threshold. Short answers
      // expected; single letters / single words need a low floor.
      return { minSpeechMs: 140, redemptionMs: 350 };
    case "off":
    case "idle":
    case "lesson-teaching":
    case "chat-active":
      // Echo-resistant default. Tutor TTS bursts that bleed into
      // the mic via speakers are typically <200ms; this filters
      // them as onVADMisfire instead of producing onSpeechEnd /
      // onSpeechRealStart.
      return { minSpeechMs: 400, redemptionMs: 800 };
    default: {
      // Exhaustiveness check — if you add a new phase to
      // VoiceListeningState, this assignment fails compilation
      // until you also add a case above. `state` is narrowed to
      // `never` here only if every variant is handled.
      const _exhaustive: never = state;
      throw new Error(
        `Unhandled VoiceListeningState: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

/**
 * Raw signals the consumer tracks. Pure inputs — no React state
 * here; the consumer reads from its own state and passes flags in.
 */
export type ListeningStateInputs = {
  /** Mic permission granted and not user-muted. */
  micActive: boolean;
  /** Any chat surface is open (takeover OR free chat). */
  isChatting: boolean;
  /** A chat stream request is in flight (between sendChat() and the
   *  first chat step landing). This is the window the original
   *  regression slipped through — chat is open but no narration
   *  flag has been raised yet. */
  isChatProcessing: boolean;
  /** Generic "tutor is producing audio" flag from useLessonChat. */
  isChatSpeaking: boolean;
  /** Specifically: chat narration is playing through TTS. */
  isChatNarrating: boolean;
  /** Lesson TTS is currently playing audio. */
  isLessonNarrating: boolean;
  /** Lesson TTS fetch is in flight (audio about to start). */
  isLessonTtsLoading: boolean;
  /** Interaction card (check_in / predict / fill_blank) is awaiting
   *  the student's answer. This is the trigger for short-answer
   *  threshold — but ONLY if no tutor signal is also active. */
  isAwaitingInteractionAnswer: boolean;
};

/**
 * Pure derivation: raw flags → state phase. The decision order is
 * fixed and documented inline:
 *
 *   1. `!micActive` → off (no signal to evaluate)
 *   2. ANY chat signal → chat-active (conversation mode; never
 *      short-answer territory)
 *   3. Lesson TTS active → lesson-teaching
 *   4. Interaction awaiting answer → interaction-awaiting (the only
 *      path to the lower threshold)
 *   5. otherwise → idle
 *
 * The ordering matters: chat takes precedence over interaction
 * because takeover fires WHILE an interaction step is still
 * technically active — without chat winning, the interaction
 * branch would re-enable short-answer mode mid-chat.
 */
export function deriveVoiceListeningState(
  flags: ListeningStateInputs,
): VoiceListeningState {
  if (!flags.micActive) return { phase: "off" };
  if (
    flags.isChatting ||
    flags.isChatProcessing ||
    flags.isChatSpeaking ||
    flags.isChatNarrating
  ) {
    return { phase: "chat-active" };
  }
  if (flags.isLessonNarrating || flags.isLessonTtsLoading) {
    return { phase: "lesson-teaching" };
  }
  if (flags.isAwaitingInteractionAnswer) {
    return { phase: "interaction-awaiting" };
  }
  return { phase: "idle" };
}
