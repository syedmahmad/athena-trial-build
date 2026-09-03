"use client";

import { createContext, useContext } from "react";
import type { DailyQuest, DailyQuestProblemWithDetails } from "@/types/adaptive";
import type { FeedbackState } from "@/components/quiz/answer-panel";
import type { QuestionPhase } from "@/components/quiz/types";

export type QuestContextValue = {
  quest: DailyQuest;
  problems: DailyQuestProblemWithDetails[];
  currentIndex: number;
  answers: Map<string, number>;
  lockedIds: Set<string>;
  feedbackMap: Map<string, FeedbackState>;
  direction: number;
  phase: "active" | "completed";
  score: number;
  elapsed: number;
  displayTime: string;
  timerHidden: boolean;
  isTimerLow: boolean;
  xpEarned: number;
  handleSelectAnswer: (problemId: string, optionIndex: number) => void;
  goNext: () => void;
  goBack: () => void;
  goTo: (index: number) => void;
  toggleTimerHidden: () => void;
  handleComplete: () => void;
  getQuestionStatus: (index: number) => "unanswered" | "answered" | "marked";
  getQuestionPhase: (id: string) => QuestionPhase;
  getWrongCount: (id: string) => number;
  stuckModalShownIds: Set<string>;
  markStuckModalShown: (id: string) => void;
};

export const QuestContext = createContext<QuestContextValue | null>(null);

export function useQuestContext() {
  const ctx = useContext(QuestContext);
  if (!ctx) throw new Error("useQuestContext must be used within QuestProvider");
  return ctx;
}
