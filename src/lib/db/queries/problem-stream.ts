import { supabase } from "@/lib/supabase/client";
import type { Problem, SolutionStep } from "@/components/quiz/types";

/**
 * Data layer for streamed/write-through quiz problems.
 *
 * Three responsibilities:
 *  1. `getSeenProblemIds` — every problem a user has already been served, so
 *     we never repeat one.
 *  2. `getUnseenSeededProblems` — the curated/previously-generated pool minus
 *     what they've seen (served instantly, no LLM).
 *  3. `persistGeneratedProblem` — write a freshly generated problem into the
 *     pool so it gets a real UUID and is tracked + never repeated.
 *
 * Generated rows reuse the `practice`/`custom` source with `category =
 * 'generated'` as a provenance marker — this sidesteps an enum migration
 * (adding a `generated` source value) while keeping the rows distinguishable.
 */

export type ProblemLinkage = {
  subtopicId?: string;
  customTopicId?: string;
  topicSlug?: string;
  subtopicSlug?: string;
};

// ── Seen-set ───────────────────────────────────────────────────────────────

/**
 * Every problem id this user has already been served. Unions two existing
 * sources (no dedicated table needed):
 *  - `quiz_question_events` — keyed directly on user_id; covers graded quizzes
 *    AND practice (via `practice_problem_id`).
 *  - `quiz_answers` — graded answers, joined through the user's sessions.
 *
 * Note: this captures problems the user *engaged with*. A problem that was
 * streamed but abandoned before any interaction isn't here — acceptable for
 * v1 (the dominant path is served → answered → tracked).
 */
export async function getSeenProblemIds(userId: string): Promise<Set<string>> {
  const seen = new Set<string>();

  const { data: events } = await supabase
    .from("quiz_question_events")
    .select("problem_id, practice_problem_id")
    .eq("user_id", userId);
  for (const e of events ?? []) {
    if (e.problem_id) seen.add(e.problem_id);
    if (e.practice_problem_id) seen.add(e.practice_problem_id);
  }

  const { data: sessions } = await supabase
    .from("quiz_sessions")
    .select("id")
    .eq("user_id", userId);
  const sessionIds = (sessions ?? []).map((s) => s.id);
  if (sessionIds.length > 0) {
    const { data: answers } = await supabase
      .from("quiz_answers")
      .select("problem_id")
      .in("session_id", sessionIds);
    for (const a of answers ?? []) {
      if (a.problem_id) seen.add(a.problem_id);
    }
  }

  return seen;
}

// ── Seeded pool (unseen) ─────────────────────────────────────────────────────

type ProblemRow = {
  id: string;
  order_index: number;
  difficulty: string;
  question_text: string;
  question_phonetic: string | null;
  options: unknown;
  correct_option: number;
  explanation: string;
  solution_steps: unknown;
  hint: string;
  detailed_hint: string | null;
  time_recommendation_seconds: number;
};

const SEEDED_COLUMNS =
  "id, order_index, difficulty, question_text, question_phonetic, options, correct_option, explanation, solution_steps, hint, detailed_hint, time_recommendation_seconds";

function rowToProblem(p: ProblemRow): Problem {
  return {
    id: p.id,
    orderIndex: p.order_index,
    difficulty: p.difficulty,
    questionText: p.question_text,
    questionPhonetic: p.question_phonetic ?? undefined,
    options: (p.options as string[]) ?? [],
    correctOption: p.correct_option,
    explanation: p.explanation,
    solutionSteps: (p.solution_steps as SolutionStep[]) ?? [],
    hint: p.hint,
    detailedHint: p.detailed_hint ?? undefined,
    timeRecommendationSeconds: p.time_recommendation_seconds,
  };
}

/**
 * Up to `limit` unseen seeded problems for the given linkage, shuffled. The
 * per-subtopic pool is small, so we pull a window and filter seen ids app-side
 * (a Postgres `not in (<big list>)` through the JS client is awkward).
 */
export async function getUnseenSeededProblems(args: {
  linkage: ProblemLinkage;
  seenIds: Set<string>;
  limit: number;
}): Promise<Problem[]> {
  const { linkage, seenIds, limit } = args;
  if (limit <= 0) return [];

  let query = supabase.from("problems").select(SEEDED_COLUMNS);
  if (linkage.customTopicId) {
    query = query.eq("custom_topic_id", linkage.customTopicId);
  } else if (linkage.subtopicId) {
    query = query.eq("subtopic_id", linkage.subtopicId);
  } else if (linkage.topicSlug && linkage.subtopicSlug) {
    query = query
      .eq("topic_slug", linkage.topicSlug)
      .eq("subtopic_slug", linkage.subtopicSlug);
  } else {
    return [];
  }

  const { data } = await query.limit(500);
  const rows = (data ?? []) as unknown as ProblemRow[];
  const unseen = rows.filter((r) => !seenIds.has(r.id));
  // Fisher-Yates so repeat visits surface a different slice of the pool.
  for (let i = unseen.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unseen[i], unseen[j]] = [unseen[j], unseen[i]];
  }
  return unseen.slice(0, limit).map(rowToProblem);
}

// ── Write-through ────────────────────────────────────────────────────────────

export type GeneratedProblemInput = {
  questionText: string;
  questionPhonetic?: string | null;
  options: string[];
  correctOption: number;
  explanation: string;
  solutionSteps: SolutionStep[];
  hint: string;
  detailedHint?: string | null;
  difficulty: string;
  timeRecommendationSeconds?: number;
};

const DIFFICULTY_LEVELS: Record<string, number> = { easy: 2, medium: 5, hard: 8 };

/**
 * Starting order_index for write-through inserts. Custom topics carry a
 * UNIQUE(custom_topic_id, order_index) index, so generated rows must start
 * past the existing max. Practice/SAT have no such constraint, so 0 is fine
 * (callers still pass distinct values per row for stable ordering).
 */
export async function getWriteThroughBaseOrderIndex(
  linkage: ProblemLinkage
): Promise<number> {
  if (!linkage.customTopicId) return 0;
  const { data } = await supabase
    .from("problems")
    .select("order_index")
    .eq("custom_topic_id", linkage.customTopicId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.order_index ?? -1) + 1;
}

/**
 * Insert a freshly generated problem into the pool. Returns the row's real
 * UUID (which replaces the ephemeral client id), or null if the insert failed
 * — callers fall back to serving it ephemerally so a write hiccup doesn't drop
 * the problem from the stream.
 */
export async function persistGeneratedProblem(args: {
  problem: GeneratedProblemInput;
  linkage: ProblemLinkage;
  orderIndex: number;
}): Promise<string | null> {
  const { problem, linkage, orderIndex } = args;
  const source = linkage.customTopicId ? "custom" : "practice";

  const { data, error } = await supabase
    .from("problems")
    .insert({
      source,
      category: "generated",
      custom_topic_id: linkage.customTopicId ?? null,
      subtopic_id: linkage.subtopicId ?? null,
      topic_slug: linkage.topicSlug ?? null,
      subtopic_slug: linkage.subtopicSlug ?? null,
      order_index: orderIndex,
      difficulty: problem.difficulty,
      difficulty_level: DIFFICULTY_LEVELS[problem.difficulty] ?? 5,
      question_text: problem.questionText,
      question_phonetic: problem.questionPhonetic ?? null,
      options: problem.options,
      correct_option: problem.correctOption,
      explanation: problem.explanation,
      solution_steps: problem.solutionSteps,
      hint: problem.hint,
      detailed_hint: problem.detailedHint ?? null,
      time_recommendation_seconds: problem.timeRecommendationSeconds ?? 90,
    })
    .select("id")
    .single();

  if (error || !data) return null;
  return data.id;
}
