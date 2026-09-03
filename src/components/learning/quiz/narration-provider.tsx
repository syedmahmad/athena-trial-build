"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useQuestionNarration } from "@/hooks/use-question-narration";

/** localStorage key for the master audio on/off preference on the quiz
 *  surface. Persisted so the toggle survives the /quiz/[n] page remount
 *  AND future sessions (students who prefer silent practice keep it). */
const AUDIO_PREF_KEY = "athena:quiz-audio-enabled";

type NarrationContextValue = ReturnType<typeof useQuestionNarration> & {
  /** Master audio on/off for the SAT practice quiz surface. When OFF,
   *  question / hint / encouragement narration AND the tutor-takeover
   *  narration are suppressed (the page gates its own play() calls on
   *  this and drives `chat.setNarrationDisabled`). Default ON. */
  audioEnabled: boolean;
  setAudioEnabled: (value: boolean) => void;
  toggleAudio: () => void;
};

const NarrationContext = createContext<NarrationContextValue | null>(null);

/**
 * Hosts the question-narration TTS hook in a component that lives ABOVE the
 * per-problem quiz page, so the audio survives navigation between problems.
 *
 * Why this exists: `QuizProblemPageContent` lives at `/quiz/[problemNumber]`,
 * and the Next.js App Router REMOUNTS a page component whenever its dynamic
 * segment value changes (confirmed empirically — the page unmounts on
 * `/quiz/1` -> `/quiz/2` while the surrounding layout/provider persists). When
 * `useQuestionNarration` was instantiated inside the page, that remount fired
 * the hook's unmount cleanup (`audio.pause()`) and cut the in-flight
 * "Correct!" / encouragement / hint narration mid-sentence — most visibly on
 * the correct-answer auto-advance, where the ~1.2s navigation timer races the
 * still-playing celebratory phrase.
 *
 * Mounting the hook here, inside the persistent `QuizLayoutProvider` (which
 * does NOT remount on problem navigation), keeps the `HTMLAudioElement` alive
 * across the page remount so the narration plays to completion. The page's
 * existing `pendingQuestionRef` queue then drains the next question's narration
 * once the orb returns to idle — exactly as it was designed to.
 *
 * The provider ALSO owns the master `audioEnabled` toggle for the same
 * remount-survival reason: page-local state would reset to ON on every
 * problem. Persisting here (state + localStorage) keeps the student's choice
 * stable across the whole quiz.
 */
export function NarrationProvider({ children }: { children: React.ReactNode }) {
  const narration = useQuestionNarration();
  // `cancel` is stable (useCallback([]) in the hook); pull it out so the
  // setter callback below doesn't depend on the whole (per-render) object.
  const cancelNarration = narration.cancel;

  // Master audio toggle. Default ON (matches the prior always-on behaviour).
  // Read synchronously from localStorage on the client so the very first
  // commit already has the correct value — this avoids a brief blip of
  // question narration for students who keep audio OFF. Safe against
  // hydration mismatch: the quiz page is data-gated (renders a loading
  // branch until useQuery resolves), so no `audioEnabled`-dependent DOM is
  // present in the SSR output to mismatch against.
  const [audioEnabled, setAudioEnabledState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = window.localStorage.getItem(AUDIO_PREF_KEY);
      return raw === null ? true : raw === "1";
    } catch {
      return true;
    }
  });

  const setAudioEnabled = useCallback(
    (value: boolean) => {
      setAudioEnabledState(value);
      try {
        window.localStorage.setItem(AUDIO_PREF_KEY, value ? "1" : "0");
      } catch {
        /* localStorage unavailable — preference is session-only */
      }
      // Turning audio off cuts any in-flight question / hint / encouragement
      // narration immediately so the toggle feels instant. (The tutor
      // takeover's own audio is stopped by the page via chat.stopAudio.)
      if (!value) cancelNarration();
    },
    [cancelNarration],
  );

  const toggleAudio = useCallback(() => {
    setAudioEnabled(!audioEnabled);
  }, [audioEnabled, setAudioEnabled]);

  return (
    <NarrationContext.Provider
      value={{ ...narration, audioEnabled, setAudioEnabled, toggleAudio }}
    >
      {children}
    </NarrationContext.Provider>
  );
}

/** Consume the shared, navigation-stable question-narration controls plus the
 *  master audio toggle. Superset of `useQuestionNarration` so existing call
 *  sites that destructure `{ orbState, play, cancel }` are unchanged. */
export function useNarrationContext(): NarrationContextValue {
  const ctx = useContext(NarrationContext);
  if (!ctx) {
    throw new Error(
      "useNarrationContext must be used within a NarrationProvider",
    );
  }
  return ctx;
}
