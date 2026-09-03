import type {
  AssignmentQuestion,
  FreeResponseQuestion,
  PublicAssignmentQuestion,
  PublicFreeResponseQuestion,
  PublicQuizQuestion,
  QuizQuestion,
} from "@/lib/db/queries/educators";

export type {
  AssignmentQuestion,
  FreeResponseQuestion,
  PublicAssignmentQuestion,
  PublicFreeResponseQuestion,
  PublicQuizQuestion,
  QuizQuestion,
};

/** Local-time YYYY-MM-DD (the educator surface's canonical date string). */
export const ymd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

export const formatShortDate = (s: string) =>
  new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

export const formatLongDate = (s: string) =>
  new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

/** Objective practice-set grading: percent correct, rounded. */
export function gradePracticeAnswers(
  questions: AssignmentQuestion[],
  answers: number[]
) {
  const total = questions.length;
  const correctCount = questions.reduce(
    (n, q, i) => n + (answers[i] === q.correctIndex ? 1 : 0),
    0
  );
  return {
    correctCount,
    total,
    grade: total ? Math.round((correctCount / total) * 100) : null,
  };
}

export const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

// ─── Free-response quiz helpers ─────────────────────────────────────────────
// An assignment's `questions` jsonb is one kind throughout: multiple-choice
// practice set (no `kind`) or free-response quiz (`kind: "free"`).

export function isFreeResponseQuestion(
  q: QuizQuestion
): q is FreeResponseQuestion {
  return (q as FreeResponseQuestion).kind === "free";
}

export function isPublicFreeResponse(
  q: PublicQuizQuestion
): q is PublicFreeResponseQuestion {
  return (q as PublicFreeResponseQuestion).kind === "free";
}

/** True when the assignment is a generated free-response quiz. */
export function isFreeResponseQuiz(
  questions: QuizQuestion[] | null | undefined
): boolean {
  return !!questions?.length && isFreeResponseQuestion(questions[0]);
}

/** True when the assignment is a multiple-choice practice set. */
export function isPracticeSet(
  questions: QuizQuestion[] | null | undefined
): boolean {
  return !!questions?.length && !isFreeResponseQuestion(questions[0]);
}

/** Teacher-only answer key assembled from free-response questions, numbered. */
export function assembleAnswerKey(questions: { answer: string }[]): string {
  return questions
    .map((q, i) => `${i + 1}. ${q.answer?.trim() || "(no answer provided)"}`)
    .join("\n");
}

/** A student's per-question answers folded into one readable response for
 *  storage + grading: each question's prompt followed by their typed answer,
 *  in order. Photos of handwritten work ride alongside as separate images. */
export function assembleQuizResponse(
  questions: { prompt: string }[],
  answers: string[]
): string {
  return questions
    .map((q, i) => {
      const a = (answers[i] ?? "").trim();
      return `${i + 1}. ${q.prompt}\nAnswer: ${a || "(left blank)"}`;
    })
    .join("\n\n");
}
