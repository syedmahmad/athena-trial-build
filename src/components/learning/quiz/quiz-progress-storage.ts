/**
 * sessionStorage-backed quiz progress, keyed by subtopic. Guards against
 * losing an in-progress quiz to a stray hard reload — the App Router falls
 * back to a full page reload whenever a client-side RSC navigation fetch
 * fails (a transient 503, a dropped connection, ...), which otherwise wipes
 * `useStreamingProblems`'s pool and `useQuizState`'s answers/index/etc. and
 * restarts the student at question 1 with a brand-new random problem set.
 *
 * Session-scoped (not localStorage) deliberately: a stale in-progress quiz
 * from days ago shouldn't resurrect itself in a fresh tab.
 */
"use client";

import type { Problem } from "@/components/quiz/types";
import type { QuestionPhase, QuizPhase } from "@/components/quiz/types";

export type StoredQuizProgress = {
  problems: Problem[];
  streamPhase: "idle" | "streaming" | "complete" | "error";
  answers: [string, number][];
  markedIds: string[];
  currentIndex: number;
  phase: QuizPhase;
  wrongCounts: [string, number][];
  questionPhases: [string, QuestionPhase][];
};

const PREFIX = "athena-quiz-progress:";

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    // Private-browsing / storage-blocked contexts can throw on access.
    return null;
  }
}

export function loadQuizProgress(key: string): StoredQuizProgress | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as StoredQuizProgress;
  } catch {
    return null;
  }
}

export function saveQuizProgress(key: string, progress: StoredQuizProgress): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(PREFIX + key, JSON.stringify(progress));
  } catch {
    // Storage full/unavailable — persistence is best-effort, never fatal.
  }
}

export function clearQuizProgress(key: string): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(PREFIX + key);
  } catch {
    /* no-op */
  }
}
