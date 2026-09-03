export type SolutionStep = {
  step: number;
  instruction: string;
  math: string;
};

export type Problem = {
  id: string;
  orderIndex: number;
  difficulty: string;
  questionText: string;
  /** TTS-ready phonetic English version of questionText. Populated at
   *  seed time for newer rows, backfilled for older ones via
   *  `.local/backfill-practice-phonetic.ts`. Undefined when the row hasn't
   *  been backfilled — the player falls back to stripTtsNoise(questionText). */
  questionPhonetic?: string;
  options: string[];
  correctOption: number;
  explanation: string;
  solutionSteps: SolutionStep[];
  hint: string;
  detailedHint?: string;
  timeRecommendationSeconds: number;
};

export type QuizPhase = "active" | "submitted";

export type QuestionStatus = "unanswered" | "answered" | "marked";

export type QuestionPhase = "question" | "hint" | "hint2" | "tutor" | "practice";
