"use client";

import { createContext, useContext } from "react";
import type {
  FullSatTestProblem,
  FullSatAnswer,
  FullSatSection,
  FullSatAttempt,
  FullSatTest,
} from "@/types/full-sat";

export type FullSatPhase = "active" | "break" | "completed";

export type FullSatContextValue = {
  // Test metadata
  attempt: FullSatAttempt;
  test: FullSatTest;
  problems: FullSatTestProblem[];

  // Current position
  currentIndex: number; // Global 0-97
  currentSection: FullSatSection;
  currentModule: number;
  currentProblem: FullSatTestProblem | null;

  // State
  answers: Map<string, number>; // problemId → selectedOption
  lockedIds: Set<string>; // answered problems
  phase: FullSatPhase;

  // Timer (countdown per module)
  timeLeft: number; // seconds remaining in current module
  displayTime: string;

  // Navigation
  goNext: () => void;
  goBack: () => void;
  goTo: (index: number) => void;
  direction: number;

  // Actions
  handleSelectAnswer: (problemId: string, optionIndex: number) => void;
  finishSection: () => void;
  submitTest: () => void;

  // Status helpers
  getQuestionStatus: (index: number) => "unanswered" | "answered";
  totalQuestions: number;
  answeredCount: number;
  sectionLabel: string;
  moduleLabel: string;

  // Timing data for submission
  rwTimeUsed: number;
  mathTimeUsed: number;
};

export const FullSatContext = createContext<FullSatContextValue | null>(null);

export function useFullSatContext() {
  const ctx = useContext(FullSatContext);
  if (!ctx) throw new Error("useFullSatContext must be used within FullSatProvider");
  return ctx;
}
