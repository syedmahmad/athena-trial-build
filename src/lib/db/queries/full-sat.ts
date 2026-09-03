import { supabase } from "@/lib/supabase/client";
import type {
  FullSatTest,
  FullSatAttempt,
  FullSatTestProblem,
  FullSatAnswer,
  FullSatSection,
} from "@/types/full-sat";

// Cast to any since supabase.ts types haven't been regenerated yet.
// After running the migration + `npx supabase gen types`, these casts can be removed.
const db = supabase as any;

// ── Tests ──

export async function getActiveTests(): Promise<FullSatTest[]> {
  const { data } = await db
    .from("full_sat_tests")
    .select("*")
    .eq("status", "active")
    .order("test_number");

  return (data ?? []).map(mapTest);
}

// ── Attempts ──

export async function getLastCompletedAttempt(
  userId: string
): Promise<FullSatAttempt | null> {
  const { data } = await db
    .from("full_sat_attempts")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? mapAttempt(data) : null;
}

export async function getInProgressAttempt(
  userId: string
): Promise<FullSatAttempt | null> {
  const { data } = await db
    .from("full_sat_attempts")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? mapAttempt(data) : null;
}

export async function getUserAttempts(
  userId: string
): Promise<FullSatAttempt[]> {
  const { data } = await db
    .from("full_sat_attempts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (data ?? []).map(mapAttempt);
}

export async function createAttempt(
  userId: string,
  testId: string
): Promise<FullSatAttempt> {
  const { data, error } = await db
    .from("full_sat_attempts")
    .insert({
      user_id: userId,
      test_id: testId,
      status: "in_progress",
    })
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create attempt");
  return mapAttempt(data);
}

export async function updateAttemptPosition(
  attemptId: string,
  position: {
    currentSection: string;
    currentModule: number;
    currentQuestion: number;
  }
) {
  await db
    .from("full_sat_attempts")
    .update({
      current_section: position.currentSection,
      current_module: position.currentModule,
      current_question: position.currentQuestion,
    })
    .eq("id", attemptId);
}

export async function completeAttempt(
  attemptId: string,
  scores: {
    rwRawScore: number;
    rwScaledScore: number;
    mathRawScore: number;
    mathScaledScore: number;
    totalScore: number;
    rwTimeSeconds: number;
    mathTimeSeconds: number;
    totalTimeSeconds: number;
  }
) {
  const { error } = await db
    .from("full_sat_attempts")
    .update({
      status: "completed",
      rw_raw_score: scores.rwRawScore,
      rw_scaled_score: scores.rwScaledScore,
      math_raw_score: scores.mathRawScore,
      math_scaled_score: scores.mathScaledScore,
      total_score: scores.totalScore,
      rw_time_seconds: scores.rwTimeSeconds,
      math_time_seconds: scores.mathTimeSeconds,
      total_time_seconds: scores.totalTimeSeconds,
      completed_at: new Date().toISOString(),
    })
    .eq("id", attemptId);

  if (error) throw new Error(error.message);
}

// ── Test problems ──

export async function getTestProblems(
  testId: string
): Promise<FullSatTestProblem[]> {
  const { data } = await db
    .from("full_sat_test_problems")
    .select(
      `
      id,
      problem_id,
      section,
      module,
      order_index,
      problems!inner (
        question_text,
        options,
        correct_option,
        explanation,
        solution_steps,
        hint,
        detailed_hint,
        subtopic_id,
        difficulty_level,
        difficulty
      )
    `
    )
    .eq("test_id", testId)
    .order("section")
    .order("module")
    .order("order_index");

  return (data ?? []).map((row: any) => ({
    id: row.id,
    problemId: row.problem_id,
    section: row.section as FullSatSection,
    module: row.module,
    orderIndex: row.order_index,
    questionText: row.problems.question_text,
    options: row.problems.options,
    correctOption: row.problems.correct_option,
    explanation: row.problems.explanation,
    solutionSteps: row.problems.solution_steps ?? [],
    hint: row.problems.hint ?? "",
    detailedHint: row.problems.detailed_hint,
    subtopicId: row.problems.subtopic_id,
    difficultyLevel: row.problems.difficulty_level,
    difficulty: row.problems.difficulty,
  }));
}

// ── Answers ──

export async function createAnswerRows(
  attemptId: string,
  problems: FullSatTestProblem[]
) {
  const rows = problems.map((p) => ({
    attempt_id: attemptId,
    problem_id: p.problemId,
    section: p.section,
    module: p.module,
    order_index: p.orderIndex,
  }));

  const { error } = await db.from("full_sat_answers").insert(rows);
  if (error) throw new Error(error.message);
}

export async function getAttemptAnswers(
  attemptId: string
): Promise<FullSatAnswer[]> {
  const { data } = await db
    .from("full_sat_answers")
    .select("*")
    .eq("attempt_id", attemptId)
    .order("section")
    .order("module")
    .order("order_index");

  return (data ?? []).map(mapAnswer);
}

export async function upsertAnswer(
  attemptId: string,
  answer: {
    problemId: string;
    section: string;
    module: number;
    orderIndex: number;
    selectedOption: number;
    isCorrect: boolean;
    responseTimeMs?: number;
  }
) {
  const { error } = await db
    .from("full_sat_answers")
    .update({
      selected_option: answer.selectedOption,
      is_correct: answer.isCorrect,
      response_time_ms: answer.responseTimeMs ?? null,
      answered_at: new Date().toISOString(),
    })
    .eq("attempt_id", attemptId)
    .eq("section", answer.section)
    .eq("module", answer.module)
    .eq("order_index", answer.orderIndex);

  if (error) throw new Error(error.message);
}

// ── Mappers ──

function mapTest(row: any): FullSatTest {
  return {
    id: row.id,
    testNumber: row.test_number,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapAttempt(row: any): FullSatAttempt {
  return {
    id: row.id,
    userId: row.user_id,
    testId: row.test_id,
    status: row.status,
    rwRawScore: row.rw_raw_score,
    rwScaledScore: row.rw_scaled_score,
    mathRawScore: row.math_raw_score,
    mathScaledScore: row.math_scaled_score,
    totalScore: row.total_score,
    rwModule1Correct: row.rw_module1_correct ?? 0,
    mathModule1Correct: row.math_module1_correct ?? 0,
    rwTimeSeconds: row.rw_time_seconds ?? 0,
    mathTimeSeconds: row.math_time_seconds ?? 0,
    totalTimeSeconds: row.total_time_seconds ?? 0,
    currentSection: row.current_section ?? "reading_writing",
    currentModule: row.current_module ?? 1,
    currentQuestion: row.current_question ?? 0,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

function mapAnswer(row: any): FullSatAnswer {
  return {
    id: row.id,
    attemptId: row.attempt_id,
    problemId: row.problem_id,
    section: row.section as FullSatSection,
    module: row.module,
    orderIndex: row.order_index,
    selectedOption: row.selected_option,
    isCorrect: row.is_correct,
    responseTimeMs: row.response_time_ms,
    answeredAt: row.answered_at,
  };
}
