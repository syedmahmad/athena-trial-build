import { supabase } from "@/lib/supabase/client";

function mapQueueItem(row: {
  id: string;
  user_id: string;
  lesson_id: string;
  status: string;
  progress_pct: number;
  added_during: string;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: row.id,
    userId: row.user_id,
    lessonId: row.lesson_id,
    status: row.status as "pending" | "in_progress" | "completed",
    progressPct: row.progress_pct,
    addedDuring: row.added_during as "onboarding" | "practice",
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function addToLearningQueue(data: {
  userId: string;
  lessonId: string;
  addedDuring: "onboarding" | "practice";
}) {
  const { data: row } = await supabase
    .from("learning_queue")
    .upsert(
      {
        user_id: data.userId,
        lesson_id: data.lessonId,
        added_during: data.addedDuring,
      },
      { onConflict: "user_id,lesson_id", ignoreDuplicates: true }
    )
    .select()
    .maybeSingle();

  return row ? mapQueueItem(row) : null;
}

export async function getUserLearningQueue(userId: string) {
  const { data } = await supabase
    .from("learning_queue")
    .select("*, lessons!lesson_id(title, estimated_duration_minutes)")
    .eq("user_id", userId);

  return (data ?? []).map((row) => ({
    id: row.id,
    lessonId: row.lesson_id,
    status: row.status as "pending" | "in_progress" | "completed",
    progressPct: row.progress_pct,
    addedDuring: row.added_during as "onboarding" | "practice",
    createdAt: new Date(row.created_at),
    lessonTitle: (row.lessons as { title: string } | null)?.title ?? null,
    estimatedDuration: (row.lessons as { estimated_duration_minutes: number } | null)?.estimated_duration_minutes ?? null,
  }));
}

export async function getQueueItemByUserAndLesson(
  userId: string,
  lessonId: string
) {
  const { data } = await supabase
    .from("learning_queue")
    .select("*")
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .limit(1)
    .maybeSingle();

  return data ? mapQueueItem(data) : null;
}

export async function updateQueueItemStatus(
  id: string,
  status: "pending" | "in_progress" | "completed",
  progressPct?: number
) {
  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (progressPct !== undefined) update.progress_pct = progressPct;

  const { data: row } = await supabase
    .from("learning_queue")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  return row ? mapQueueItem(row) : null;
}
