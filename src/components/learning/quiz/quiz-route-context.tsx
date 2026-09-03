"use client";

import { createContext, useContext } from "react";
import type { Problem } from "@/components/quiz/types";
import type { FeedbackState } from "@/components/quiz/answer-panel";
import type { useQuizState } from "./use-quiz-state";
import type { useQuizTimer } from "./use-quiz-timer";

export type QuizRouteContextValue = {
  problems: Problem[];
  topicName: string;
  subtopicName: string;
  subject?: "math" | "reading-writing";
  basePath: string;
  practiceProblemsUrl?: string;
  /** When false, the results screen skips the mandatory "Practice 2 More
   *  Problems" round and shows the Close button immediately. Default true
   *  to preserve the SAT quiz behaviour. Personalized quizzes opt out
   *  because PostLessonPractice fetches by topic/subtopic name, which
   *  doesn't resolve for synthetic personalized sessions. */
  enablePostQuizPractice: boolean;
  /** Intended total when problems stream in over time (progress denominator).
   *  Undefined for static quizzes. */
  targetCount?: number;
  /** True while problems are still streaming in — gates last-problem/submit. */
  isGenerating?: boolean;
  /** Quiz launched from the SAT brand surface — tutor chat keeps SAT framing. */
  satFocused?: boolean;
  quiz: ReturnType<typeof useQuizState>;
  timer: ReturnType<typeof useQuizTimer>;
  feedbackMap: Map<string, FeedbackState>;
  lockedIds: Set<string>;
  direction: number;
  saveStatus: "idle" | "saving" | "saved" | "error";
  setSaveStatus: (s: "idle" | "saving" | "saved" | "error") => void;
  /** Persisted `quiz_sessions.id` returned by the save endpoint —
   * set after `setSaveStatus("saved")`. Consumers (ResultsScreen)
   * use it to enable the "Download report" button. */
  quizSessionId: string | null;
  setFeedbackMap: React.Dispatch<React.SetStateAction<Map<string, FeedbackState>>>;
  setLockedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  handleSelectAnswer: (problemId: string, optionIndex: number) => void;
  stuckModalShownIds: Set<string>;
  markStuckModalShown: (problemId: string) => void;
  practiceEntryModalShownIds: Set<string>;
  markPracticeEntryModalShown: (problemId: string) => void;
};

export const QuizRouteContext = createContext<QuizRouteContextValue | null>(null);

export function useQuizRouteContext(): QuizRouteContextValue {
  const ctx = useContext(QuizRouteContext);
  if (!ctx) throw new Error("useQuizRouteContext must be used within QuizRouteLayout");
  return ctx;
}
