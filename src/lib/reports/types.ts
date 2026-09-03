export type ReportKind = "micro-lesson" | "quiz" | "flashcard";

/**
 * Whitelist of lucide-react icon names the analysis model is allowed
 * to use. The print-page renderer maps these to icon components via a
 * fixed switch, so anything outside this list falls back to a generic
 * Circle. Keep in sync with `agents/app/reports/report_pdf_agent.py`.
 */
export const REPORT_ICONS = [
  "zap",
  "target",
  "trending-up",
  "compass",
  "brain",
  "clock",
  "scale",
  "lightbulb",
  "shield-check",
  "alert-triangle",
  "footprints",
  "telescope",
  "check-circle",
  "book-open",
  "message-circle-question",
] as const;

export type ReportIcon = (typeof REPORT_ICONS)[number];

export type ReportChip = {
  icon: ReportIcon;
  label: string;
  detail?: string;
};

/** Structured JSON the analysis endpoint emits via Claude tool-use. */
export type ReportAnalysis = {
  headline: string;
  scoreContext: string;
  strengths: ReportChip[];
  growthAreas: ReportChip[];
  speedInsight: string;
  nextStepSuggestion: string;
};

/** Snapshot of in-browser ephemeral state at the moment the student
 * clicks "Download report". Chat transcript and per-step attempts
 * aren't persisted to Supabase (only counts), so we capture them
 * here at point-of-use. */
export type ChatMessageSnapshot = {
  role: "user" | "tutor";
  content: string;
};

export type PerStepAttempt = {
  stepIndex: number;
  kind: "check_in" | "predict" | "fill_blank";
  wrongCount: number;
  hintReached: "none" | "hinted" | "detailed";
  /** Whether the student ever escalated to tutor takeover on this step. */
  tutorEntered: boolean;
};

export type StepTiming = {
  stepIndex: number;
  /** ms between step becoming visible and student submitting an answer.
   * null if the step is informational or the student never answered. */
  responseMs: number | null;
};

export type MicroLessonSnapshot = {
  chatMessages: ChatMessageSnapshot[];
  perStepAttempts: PerStepAttempt[];
  stepTimings: StepTiming[];
  learningObjectives: string[];
  keyFormulas: { latex: string; description: string }[];
  topicName: string;
  subtopicName: string;
};

/** Derived metrics from quiz_answers + quiz_question_events. Computed
 * in JS before being sent to the LLM so the model judges rather than
 * arithmetics. */
export type QuizPerQuestion = {
  index: number;
  problemId: string;
  isCorrect: boolean;
  responseTimeMs: number | null;
  wrongCount: number;
  hintUsed: boolean;
  tutorUsed: boolean;
  practiceCompleted: boolean;
  difficultyLevel: number;
};

export type QuizEventDensity = {
  answerWrong: number;
  hintShown: number;
  tutorEntered: number;
  tutorCorrect: number;
  practiceStarted: number;
  practiceCorrect: number;
  practiceExhausted: number;
};

export type QuizAggregates = {
  sessionId: string;
  topicName: string;
  subtopicName: string;
  score: number;
  totalQuestions: number;
  timeElapsedSeconds: number;
  createdAt: string;
  accuracy: number;
  meanResponseTimeMs: number | null;
  medianResponseTimeMs: number | null;
  hintRate: number;
  tutorRate: number;
  /** practice_completed_count / max(tutor_count, 1) */
  recoveryRate: number;
  perQuestion: QuizPerQuestion[];
  events: QuizEventDensity;
  skill?: {
    level: number;
    xp: number;
    streakCorrect: number;
    streakWrong: number;
  } | null;
};

export type MicroLessonAggregates = {
  sessionId: string;
  topicName: string;
  subtopicName: string;
  durationSeconds: number;
  stepsViewed: number;
  totalSteps: number;
  checkinsCorrect: number;
  checkinsTotal: number;
  /** Persisted count of chat messages exchanged (server-side ground
   * truth). The actual transcript content comes from the client
   * snapshot. */
  chatMessageCount: number;
  completed: boolean;
  createdAt: string;
  skill?: {
    level: number;
    xp: number;
    streakCorrect: number;
    streakWrong: number;
  } | null;
};

export type FlashcardForPrint = {
  problemId: string;
  difficulty: string;
  questionText: string;
  options: { letter: "A" | "B" | "C" | "D"; text: string }[];
  correctLetter: "A" | "B" | "C" | "D";
  explanation: string;
  solutionSteps: string[];
};

export type FlashcardDeckPayload = {
  topicName: string;
  subtopicName: string;
  cards: FlashcardForPrint[];
};

/** The complete payload cached under a token, passed to the print
 * page and consumed by the report React component. */
export type CachedReportPayload =
  | {
      kind: "quiz";
      userId: string;
      generatedAt: string;
      aggregates: QuizAggregates;
      analysis: ReportAnalysis;
    }
  | {
      kind: "micro-lesson";
      userId: string;
      generatedAt: string;
      aggregates: MicroLessonAggregates;
      snapshot: MicroLessonSnapshot;
      analysis: ReportAnalysis;
    }
  | {
      kind: "flashcard";
      userId: string;
      generatedAt: string;
      deck: FlashcardDeckPayload;
    };
