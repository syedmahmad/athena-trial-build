"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Strip math delimiters / LaTeX wrappers so TTS doesn't read raw `$`,
 *  `\textcolor{...}{X}`, etc. Mirrors the helper that previously lived
 *  inline in `practice-whiteboard.tsx`. Used as the fallback when a
 *  problem's `questionPhonetic` field is missing — newly-seeded rows
 *  ship with phonetic narration authored by the model, but older rows
 *  haven't been backfilled. */
export function stripTtsNoise(text: string): string {
  if (!text) return text;
  let out = text;
  for (let i = 0; i < 3; i++) {
    const prev = out;
    out = out.replace(
      /\\(htmlClass|htmlId|cssId|textcolor|color)\{[^{}]*\}\{([^{}]*)\}/g,
      "$2",
    );
    if (out === prev) break;
  }
  out = out.replace(/\$([^$]*)\$/g, "$1");
  return out.trim();
}

export type NarrationOrbState = "idle" | "thinking" | "speaking";

export type PlayOptions = {
  /** Whether the caller can be cut off by a later `cancel({ onlyInterruptible: true })`.
   *  - `true`  — the question being read aloud; a click on an answer choice
   *              should silence it because the student has decided.
   *  - `false` — the moving-on encouragement after "Got it", a hint after
   *              the first wrong answer, or any voice-coach line that
   *              must finish so the student hears the whole sentence.
   *  Default `true`: most callers play the question. Other surfaces opt
   *  out explicitly. */
  interruptible?: boolean;
};

export type CancelOptions = {
  /** When `true`, only stop if the current narration was started with
   *  `interruptible: true`. Use this from answer-click handlers so the
   *  click cuts the question (its job is done) but doesn't kill a hint
   *  or encouragement that's still mid-sentence. */
  onlyInterruptible?: boolean;
};

/** TTS hook used by every practice-quiz surface that wants to read the
 *  current problem aloud. Hits ElevenLabs via `/api/agent/text-to-speech`,
 *  falls back to the browser's SpeechSynthesis on any failure (network,
 *  quota_exceeded, or audio-element error). Cancels on unmount and
 *  whenever the caller invokes the returned `cancel()`.
 *
 *  Returns `orbState` so the caller can drive a visualiser (matches the
 *  micro-lesson orb state machine: `idle` → `thinking` → `speaking` →
 *  `idle`). */
export function useQuestionNarration(): {
  play: (text: string, options?: PlayOptions) => void;
  cancel: (options?: CancelOptions) => void;
  orbState: NarrationOrbState;
} {
  const [orbState, setOrbState] = useState<NarrationOrbState>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  // Tracks whether the in-flight narration was started as interruptible.
  // Read by `cancel({ onlyInterruptible: true })` so an answer-click can
  // cut a question without cutting a hint/encouragement.
  const currentInterruptibleRef = useRef<boolean>(true);
  // Queue of one play request that arrived while a non-interruptible
  // narration was in flight. Drained on natural end (audio.onended /
  // utt.onend / safety timeout). The bug this prevents: the SAT quiz's
  // "Got it" path plays an encouragement phrase with interruptible:
  // false then advances 800ms later. When the next problem mounts,
  // its question-narration effect calls play() again, which used to
  // unconditionally cancel the in-flight — cutting the encouragement
  // mid-sentence. The call-site's pendingQuestionRef queue tried to
  // prevent this but had an orbState race window. Honoring
  // non-interruptible here closes that race for good.
  type PendingPlay = { text: string; options?: PlayOptions };
  const pendingPlayRef = useRef<PendingPlay | null>(null);
  // Self-reference for recursive play() calls from the natural-end
  // handlers. useCallback([]) keeps the identity stable but the
  // closures captured inside reference `play` lexically — using a
  // ref avoids the eslint self-reference flag.
  const playRef = useRef<((text: string, options?: PlayOptions) => void) | null>(null);

  const play = useCallback((text: string, options?: PlayOptions) => {
    const interruptible = options?.interruptible ?? true;
    // Honor in-flight non-interruptible narration: queue this call
    // instead of cancelling. The natural-end handlers below drain the
    // queue. Replacement queue (slot of 1) is intentional — if multiple
    // plays land during a single non-interruptible window, the latest
    // wins.
    if (cancelRef.current && !currentInterruptibleRef.current) {
      pendingPlayRef.current = { text, options };
      return;
    }
    pendingPlayRef.current = null;
    cancelRef.current?.();
    cancelRef.current = null;
    currentInterruptibleRef.current = interruptible;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof navigator !== "undefined" && navigator.webdriver) return;
    if (!text) return;

    let cancelled = false;
    setOrbState("thinking");
    cancelRef.current = () => {
      cancelled = true;
      // Manual cancel = stop everything, including any queued follow-up.
      // The drain only runs on NATURAL end (audio.onended /
      // SpeechSynthesis onend) where `cancelled` stays false.
      pendingPlayRef.current = null;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setOrbState("idle");
    };

    // Drain helper — called from natural-end paths only. If a play()
    // request was queued during this narration (non-interruptible
    // protection), kick it off now.
    const drainPending = () => {
      if (cancelled) return;
      const pending = pendingPlayRef.current;
      pendingPlayRef.current = null;
      if (pending) {
        // Clear cancelRef so the recursive play() doesn't see the
        // just-finished narration as an in-flight non-interruptible
        // and queue itself.
        cancelRef.current = null;
        currentInterruptibleRef.current = true;
        playRef.current?.(pending.text, pending.options);
      }
    };

    const spoken = stripTtsNoise(text);
    if (!spoken) {
      setOrbState("idle");
      return;
    }

    const fallbackSpeak = () => {
      if (cancelled) return false;
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        return false;
      }
      try {
        const utt = new SpeechSynthesisUtterance(spoken);
        utt.rate = 1.0;
        const wordCount = spoken.split(/\s+/).filter(Boolean).length;
        const estimatedMs = Math.max(2000, (wordCount / 150) * 60_000);
        let safety: ReturnType<typeof setTimeout> | null = null;
        const finish = () => {
          if (safety) {
            clearTimeout(safety);
            safety = null;
          }
          if (!cancelled) setOrbState("idle");
          drainPending();
        };
        utt.onend = finish;
        utt.onerror = finish;
        setOrbState("speaking");
        safety = setTimeout(finish, estimatedMs * 2);
        const prevCancel = cancelRef.current;
        cancelRef.current = () => {
          if (safety) {
            clearTimeout(safety);
            safety = null;
          }
          prevCancel?.();
        };
        window.speechSynthesis.speak(utt);
        return true;
      } catch {
        return false;
      }
    };

    (async () => {
      try {
        const res = await fetch("/api/agent/text-to-speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: spoken }),
        });
        if (cancelled) return;
        if (!res.ok) {
          fallbackSpeak();
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          if (!cancelled) setOrbState("idle");
          URL.revokeObjectURL(url);
          drainPending();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          if (!cancelled && !fallbackSpeak()) {
            setOrbState("idle");
            drainPending();
          }
        };
        setOrbState("speaking");
        await audio.play().catch(() => {
          if (!cancelled && !fallbackSpeak()) setOrbState("idle");
        });
      } catch {
        if (!cancelled && !fallbackSpeak()) setOrbState("idle");
      }
    })();
  }, []);

  // Keep playRef in sync so the natural-end drain inside the play
  // closure can call back into play() without a self-reference lint.
  playRef.current = play;

  const cancel = useCallback((options?: CancelOptions) => {
    if (options?.onlyInterruptible && !currentInterruptibleRef.current) {
      return;
    }
    cancelRef.current?.();
    cancelRef.current = null;
  }, []);

  // Stop in-flight audio on unmount.
  useEffect(() => {
    return () => {
      pendingPlayRef.current = null;
      cancelRef.current?.();
      cancelRef.current = null;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return { play, cancel, orbState };
}
