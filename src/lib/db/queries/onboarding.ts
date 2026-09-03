import { supabase } from "@/lib/supabase/client";

function mapProgress(row: {
  id: string;
  user_id: string;
  current_step: string;
  quiz_question_index: number;
  lesson_preference: string | null;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: row.id,
    userId: row.user_id,
    currentStep: row.current_step as "plan" | "quiz" | "schedule" | "completed",
    quizQuestionIndex: row.quiz_question_index,
    lessonPreference: row.lesson_preference as "view_now" | "queue_for_later" | null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function getOnboardingProgress(userId: string) {
  const { data } = await supabase
    .from("onboarding_progress")
    .select("*")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  return data ? mapProgress(data) : null;
}

export async function upsertOnboardingProgress(
  userId: string,
  data: Partial<{
    currentStep: "plan" | "quiz" | "schedule" | "completed";
    quizQuestionIndex: number;
    lessonPreference: "view_now" | "queue_for_later";
  }>
) {
  const { data: row } = await supabase
    .from("onboarding_progress")
    .upsert(
      {
        user_id: userId,
        current_step: data.currentStep ?? "plan",
        quiz_question_index: data.quizQuestionIndex ?? 0,
        lesson_preference: data.lessonPreference ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  return row ? mapProgress(row) : null;
}
