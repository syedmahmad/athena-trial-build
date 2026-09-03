export type FullSatSection = "reading_writing" | "math";
export type FullSatTestStatus = "draft" | "active" | "retired";
export type FullSatAttemptStatus = "in_progress" | "completed" | "abandoned";

export type FullSatTest = {
  id: string;
  testNumber: number;
  name: string;
  status: FullSatTestStatus;
  createdAt: string;
};

export type FullSatAttempt = {
  id: string;
  userId: string;
  testId: string;
  status: FullSatAttemptStatus;
  rwRawScore: number | null;
  rwScaledScore: number | null;
  mathRawScore: number | null;
  mathScaledScore: number | null;
  totalScore: number | null;
  rwModule1Correct: number;
  mathModule1Correct: number;
  rwTimeSeconds: number;
  mathTimeSeconds: number;
  totalTimeSeconds: number;
  currentSection: FullSatSection;
  currentModule: number;
  currentQuestion: number;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
};

export type FullSatTestProblem = {
  id: string;
  problemId: string;
  section: FullSatSection;
  module: number;
  orderIndex: number;
  // Problem content (joined from problems table)
  questionText: string;
  options: string[];
  correctOption: number;
  explanation: string;
  solutionSteps: { step: number; instruction: string; math?: string }[];
  hint: string;
  detailedHint?: string;
  subtopicId: string;
  difficultyLevel: number;
  difficulty: string;
};

export type FullSatAnswer = {
  id: string;
  attemptId: string;
  problemId: string;
  section: FullSatSection;
  module: number;
  orderIndex: number;
  selectedOption: number | null;
  isCorrect: boolean | null;
  responseTimeMs: number | null;
  answeredAt: string | null;
};

/** Module time limits in seconds */
export const MODULE_TIME_LIMITS = {
  reading_writing: { 1: 32 * 60, 2: 32 * 60 },
  math: { 1: 35 * 60, 2: 35 * 60 },
} as const;

/** Total question counts */
export const MODULE_QUESTION_COUNTS = {
  reading_writing: { 1: 27, 2: 27 },
  math: { 1: 22, 2: 22 },
} as const;

/** Maps global question number (1-98) to section/module */
export function questionToSectionModule(questionNumber: number): {
  section: FullSatSection;
  module: number;
  orderIndex: number;
} {
  if (questionNumber <= 27) {
    return { section: "reading_writing", module: 1, orderIndex: questionNumber - 1 };
  } else if (questionNumber <= 54) {
    return { section: "reading_writing", module: 2, orderIndex: questionNumber - 28 };
  } else if (questionNumber <= 76) {
    return { section: "math", module: 1, orderIndex: questionNumber - 55 };
  } else {
    return { section: "math", module: 2, orderIndex: questionNumber - 77 };
  }
}

/** Maps section/module/orderIndex to global question number (1-98) */
export function sectionModuleToQuestion(
  section: FullSatSection,
  module: number,
  orderIndex: number
): number {
  if (section === "reading_writing") {
    return module === 1 ? orderIndex + 1 : orderIndex + 28;
  }
  return module === 1 ? orderIndex + 55 : orderIndex + 77;
}

/** Cooldown duration in milliseconds (14 days) */
export const FULL_SAT_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export type FullSatStatusResponse = {
  tests: FullSatTest[];
  lastAttempt: {
    completedAt: string;
    totalScore: number;
    testId: string;
  } | null;
  canTakeTest: boolean;
  nextAvailableDate: string | null;
  currentAttempt: FullSatAttempt | null;
};

export type FullSatStartResponse = {
  attemptId: string;
  test: FullSatTest;
  problems: FullSatTestProblem[];
  answers: FullSatAnswer[];
};

export type FullSatSubmitResponse = {
  rwRawScore: number;
  rwScaledScore: number;
  mathRawScore: number;
  mathScaledScore: number;
  totalScore: number;
};

export type FullSatHistoryResponse = {
  attempts: FullSatAttempt[];
};
