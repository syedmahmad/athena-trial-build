import { supabase } from "@/lib/supabase/client";

const QUIZ_LIMITS = { easy: 3, medium: 3, hard: 4 };

function mapQuestion(row: {
  id: string;
  order_index: number;
  difficulty: string;
  category: string | null;
  question_text: string;
  options: unknown;
  correct_option: number;
  explanation: string;
  created_at: string;
}) {
  return {
    id: row.id,
    orderIndex: row.order_index,
    difficulty: row.difficulty,
    category: row.category ?? "",
    questionText: row.question_text,
    options: row.options as string[],
    correctOption: row.correct_option,
    explanation: row.explanation,
    createdAt: new Date(row.created_at),
  };
}

export async function getQuizQuestions() {
  const [easyRes, mediumRes, hardRes] = await Promise.all([
    supabase
      .from("problems")
      .select("*")
      .eq("source", "onboarding")
      .eq("difficulty", "easy")
      .order("order_index", { ascending: true })
      .limit(QUIZ_LIMITS.easy),
    supabase
      .from("problems")
      .select("*")
      .eq("source", "onboarding")
      .eq("difficulty", "medium")
      .order("order_index", { ascending: true })
      .limit(QUIZ_LIMITS.medium),
    supabase
      .from("problems")
      .select("*")
      .eq("source", "onboarding")
      .eq("difficulty", "hard")
      .order("order_index", { ascending: true })
      .limit(QUIZ_LIMITS.hard),
  ]);

  return [
    ...(easyRes.data ?? []),
    ...(mediumRes.data ?? []),
    ...(hardRes.data ?? []),
  ].map(mapQuestion);
}

export async function getQuestionById(questionId: string) {
  const { data } = await supabase
    .from("problems")
    .select("*")
    .eq("id", questionId)
    .eq("source", "onboarding")
    .limit(1)
    .maybeSingle();

  return data ? mapQuestion(data) : null;
}

export async function recordQuizAttempt(data: {
  userId: string;
  questionId: string;
  selectedOption: number;
  isCorrect: boolean;
  timeSpentSeconds?: number;
}) {
  // Create a session for this single attempt
  const { data: session, error: sessionError } = await supabase
    .from("quiz_sessions")
    .insert({
      user_id: data.userId,
      source: "onboarding",
      score: data.isCorrect ? 1 : 0,
      total_questions: 1,
      time_elapsed_seconds: data.timeSpentSeconds ?? 0,
    })
    .select()
    .single();

  if (sessionError || !session) return null;

  const { data: answer } = await supabase
    .from("quiz_answers")
    .insert({
      session_id: session.id,
      problem_id: data.questionId,
      selected_option: data.selectedOption,
      is_correct: data.isCorrect,
    })
    .select()
    .single();

  if (!answer) return null;
  return {
    id: answer.id,
    userId: data.userId,
    questionId: data.questionId,
    selectedOption: answer.selected_option,
    isCorrect: answer.is_correct,
    timeSpentSeconds: data.timeSpentSeconds ?? null,
    createdAt: new Date(answer.created_at),
  };
}

export async function getUserQuizAttempts(userId: string) {
  const { data: sessions } = await supabase
    .from("quiz_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("source", "onboarding");

  const sessionIds = (sessions ?? []).map((s) => s.id);
  if (sessionIds.length === 0) return [];

  const { data: answers } = await supabase
    .from("quiz_answers")
    .select("*")
    .in("session_id", sessionIds);

  return (answers ?? []).map((row) => ({
    id: row.id,
    userId,
    questionId: row.problem_id,
    selectedOption: row.selected_option,
    isCorrect: row.is_correct,
    timeSpentSeconds: null,
    createdAt: new Date(row.created_at),
  }));
}
