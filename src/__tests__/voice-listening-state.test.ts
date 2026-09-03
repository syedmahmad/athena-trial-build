import { describe, expect, it } from "vitest";
import {
  deriveVoiceListeningState,
  thresholdsForListeningState,
  type ListeningStateInputs,
  type VoiceListeningState,
} from "@/lib/voice/voice-listening-state";

/**
 * Regression guards for the voice-listening state machine. The
 * threshold this protects is binary: tutor-TTS-resistant (400ms) or
 * short-answer-friendly (140ms). Picking the wrong one causes
 * either short answers to vanish OR the tutor to cancel its own
 * TTS (the bug that kept regressing). Each test below pins one of
 * those failure modes against the architecture.
 */

const baseFlags: ListeningStateInputs = {
  micActive: true,
  isChatting: false,
  isChatProcessing: false,
  isChatSpeaking: false,
  isChatNarrating: false,
  isLessonNarrating: false,
  isLessonTtsLoading: false,
  isAwaitingInteractionAnswer: false,
};

const SHORT_ANSWER_THRESHOLD = 140;
const CONSERVATIVE_THRESHOLD = 400;

describe("deriveVoiceListeningState", () => {
  it("returns 'off' when mic is inactive (even with other flags set)", () => {
    expect(
      deriveVoiceListeningState({
        ...baseFlags,
        micActive: false,
        isChatting: true,
        isAwaitingInteractionAnswer: true,
      }).phase,
    ).toBe("off");
  });

  it("returns 'idle' when mic is active and nothing else is", () => {
    expect(deriveVoiceListeningState(baseFlags).phase).toBe("idle");
  });

  it("returns 'lesson-teaching' when lesson narration is playing", () => {
    expect(
      deriveVoiceListeningState({ ...baseFlags, isLessonNarrating: true })
        .phase,
    ).toBe("lesson-teaching");
  });

  it("returns 'lesson-teaching' when lesson TTS is loading (audio about to start)", () => {
    expect(
      deriveVoiceListeningState({ ...baseFlags, isLessonTtsLoading: true })
        .phase,
    ).toBe("lesson-teaching");
  });

  it("returns 'interaction-awaiting' for the short-answer window (interaction active, no tutor TTS, no chat)", () => {
    expect(
      deriveVoiceListeningState({
        ...baseFlags,
        isAwaitingInteractionAnswer: true,
      }).phase,
    ).toBe("interaction-awaiting");
  });

  // ── Chat-precedence guards: ANY chat signal must beat the
  //    interaction-awaiting branch. This is the regression class
  //    that kept reopening. ──
  describe("chat signals win over interaction state", () => {
    const chatSignals = [
      "isChatting",
      "isChatProcessing",
      "isChatSpeaking",
      "isChatNarrating",
    ] as const;

    for (const signal of chatSignals) {
      it(`'${signal}' true → chat-active (even with isAwaitingInteractionAnswer)`, () => {
        const state = deriveVoiceListeningState({
          ...baseFlags,
          [signal]: true,
          isAwaitingInteractionAnswer: true,
        });
        expect(state.phase).toBe("chat-active");
      });
    }

    it("isChatting + isChatProcessing (takeover-seed-in-flight window) → chat-active", () => {
      // This is the EXACT regression: sendChat() fires, isChatting
      // flips true, isChatProcessing flips true, but no narration
      // flag is set yet. The original code only checked the
      // narration flags and used short-answer threshold here,
      // causing the first chat step's TTS to self-trigger VAD.
      expect(
        deriveVoiceListeningState({
          ...baseFlags,
          isChatting: true,
          isChatProcessing: true,
          isAwaitingInteractionAnswer: true,
        }).phase,
      ).toBe("chat-active");
    });
  });

  it("lesson-teaching wins over interaction-awaiting (tutor still reading the question)", () => {
    expect(
      deriveVoiceListeningState({
        ...baseFlags,
        isLessonNarrating: true,
        isAwaitingInteractionAnswer: true,
      }).phase,
    ).toBe("lesson-teaching");
  });
});

describe("thresholdsForListeningState", () => {
  it("interaction-awaiting → short-answer thresholds (140ms)", () => {
    expect(
      thresholdsForListeningState({ phase: "interaction-awaiting" })
        .minSpeechMs,
    ).toBe(SHORT_ANSWER_THRESHOLD);
  });

  it.each([
    "off",
    "idle",
    "lesson-teaching",
    "chat-active",
  ] as const)(
    "phase '%s' → conservative thresholds (400ms)",
    (phase) => {
      expect(
        thresholdsForListeningState({ phase } as VoiceListeningState)
          .minSpeechMs,
      ).toBe(CONSERVATIVE_THRESHOLD);
    },
  );

  // ── The killer regression guard: any flag combination involving
  //    a chat signal must, after going through derive + threshold,
  //    land on the conservative threshold. If a future patch adds a
  //    chat-related flag but forgets to thread it through
  //    deriveVoiceListeningState, this test catches it. ──
  describe("chat signal → conservative threshold (end-to-end)", () => {
    const chatSignals = [
      "isChatting",
      "isChatProcessing",
      "isChatSpeaking",
      "isChatNarrating",
    ] as const;

    for (const signal of chatSignals) {
      it(`${signal}=true ⇒ minSpeechMs=${CONSERVATIVE_THRESHOLD}`, () => {
        const state = deriveVoiceListeningState({
          ...baseFlags,
          [signal]: true,
        });
        expect(thresholdsForListeningState(state).minSpeechMs).toBe(
          CONSERVATIVE_THRESHOLD,
        );
      });
    }
  });

  // ── Same guard for any lesson-narration signal. ──
  describe("lesson narration → conservative threshold (end-to-end)", () => {
    const narrationSignals = ["isLessonNarrating", "isLessonTtsLoading"] as const;

    for (const signal of narrationSignals) {
      it(`${signal}=true ⇒ minSpeechMs=${CONSERVATIVE_THRESHOLD}`, () => {
        const state = deriveVoiceListeningState({
          ...baseFlags,
          [signal]: true,
        });
        expect(thresholdsForListeningState(state).minSpeechMs).toBe(
          CONSERVATIVE_THRESHOLD,
        );
      });
    }
  });

  // ── Short-answer ONLY in the precise allowed window. ──
  it("ONLY produces short-answer threshold when interaction is awaiting AND no tutor signal is active", () => {
    const state = deriveVoiceListeningState({
      ...baseFlags,
      isAwaitingInteractionAnswer: true,
    });
    expect(thresholdsForListeningState(state).minSpeechMs).toBe(
      SHORT_ANSWER_THRESHOLD,
    );
  });
});
