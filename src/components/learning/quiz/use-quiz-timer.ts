"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Problem, QuizPhase } from "@/components/quiz/types";

export function useQuizTimer(problems: Problem[], phase: QuizPhase) {
  const totalSeconds = problems.reduce(
    (sum, p) => sum + (p.timeRecommendationSeconds || 60),
    0
  );
  const [remaining, setRemaining] = useState(totalSeconds);
  const [hidden, setHidden] = useState(false);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // When problems stream in after mount, totalSeconds grows. `remaining` is
  // seeded once from the initial total, so add each increase to it — otherwise
  // a quiz that starts with one streamed problem would show a one-problem
  // clock. For a static quiz totalSeconds never changes, so this is a no-op.
  const prevTotalRef = useRef(totalSeconds);
  useEffect(() => {
    if (totalSeconds > prevTotalRef.current) {
      setRemaining((r) => r + (totalSeconds - prevTotalRef.current));
    }
    prevTotalRef.current = totalSeconds;
  }, [totalSeconds]);

  useEffect(() => {
    if (phase === "submitted" || paused) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 0) return 0;
        return r - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [phase, paused]);

  const toggleHidden = useCallback(() => setHidden((h) => !h), []);
  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);

  const elapsed = totalSeconds - remaining;

  const formatTime = (seconds: number) => {
    const m = Math.floor(Math.abs(seconds) / 60);
    const s = Math.abs(seconds) % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return {
    remaining,
    elapsed,
    totalSeconds,
    hidden,
    paused,
    toggleHidden,
    pause,
    resume,
    displayTime: formatTime(remaining),
    isLow: remaining > 0 && remaining <= 60,
  };
}
