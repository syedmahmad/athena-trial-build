import { supabase } from "@/lib/supabase/client";

export async function insertQuizQuestionEvents(
  events: {
    sessionId: string;
    problemId: string;
    userId: string;
    eventType: string;
    responseTimeMs?: number;
    selectedOption?: number;
    wrongCount?: number;
    practiceProblemId?: string;
    timestamp?: string;
  }[]
) {
  if (events.length === 0) return;

  const { error } = await (supabase as any)
    .from("quiz_question_events")
    .insert(
      events.map((e) => ({
        session_id: e.sessionId,
        problem_id: e.problemId,
        user_id: e.userId,
        event_type: e.eventType,
        ...(e.responseTimeMs !== undefined && { response_time_ms: e.responseTimeMs }),
        ...(e.selectedOption !== undefined && { selected_option: e.selectedOption }),
        ...(e.wrongCount !== undefined && { wrong_count: e.wrongCount }),
        ...(e.practiceProblemId && { practice_problem_id: e.practiceProblemId }),
        ...(e.timestamp && { created_at: e.timestamp }),
      }))
    );

  if (error) throw new Error(error.message);
}

export type SubtopicSessionSummary = {
  lastVisitedAt: string;
  completed: boolean;
  stepsViewed: number | null;
  totalSteps: number | null;
};

/**
 * Latest micro_lesson_session per subtopic for a user, keyed by
 * subtopic_id. "Latest" = most recent last_heartbeat_at (which is
 * touched on every session update). Used by the dashboard topic
 * picker to show last-opened time + progress.
 */
export async function getLatestSessionsBySubtopic(
  userId: string
): Promise<Map<string, SubtopicSessionSummary>> {
  const { data } = await supabase
    .from("micro_lesson_sessions")
    .select("subtopic_id, last_heartbeat_at, completed, steps_viewed, total_steps")
    .eq("user_id", userId)
    .order("last_heartbeat_at", { ascending: false });

  const map = new Map<string, SubtopicSessionSummary>();
  for (const row of data ?? []) {
    if (map.has(row.subtopic_id)) continue;
    map.set(row.subtopic_id, {
      lastVisitedAt: row.last_heartbeat_at,
      completed: !!row.completed,
      stepsViewed: row.steps_viewed,
      totalSteps: row.total_steps,
    });
  }
  return map;
}

export async function createMicroLessonSession(data: {
  userId: string;
  microLessonId: string;
  subtopicId: string;
  totalSteps: number;
}): Promise<{ id: string }> {
  const { data: row, error } = await (supabase as any)
    .from("micro_lesson_sessions")
    .insert({
      user_id: data.userId,
      micro_lesson_id: data.microLessonId,
      subtopic_id: data.subtopicId,
      total_steps: data.totalSteps,
    })
    .select("id")
    .single();

  if (error || !row) throw new Error(error?.message ?? "Failed to create session");
  return { id: row.id };
}

export async function updateMicroLessonSession(
  sessionId: string,
  updates: {
    durationSeconds?: number;
    stepsViewed?: number;
    checkinsCorrect?: number;
    checkinsTotal?: number;
    chatMessages?: number;
    ended?: boolean;
    completed?: boolean;
  }
) {
  const patch: Record<string, unknown> = {
    last_heartbeat_at: new Date().toISOString(),
  };
  if (updates.durationSeconds !== undefined) patch.duration_seconds = updates.durationSeconds;
  if (updates.stepsViewed !== undefined) patch.steps_viewed = updates.stepsViewed;
  if (updates.checkinsCorrect !== undefined) patch.checkins_correct = updates.checkinsCorrect;
  if (updates.checkinsTotal !== undefined) patch.checkins_total = updates.checkinsTotal;
  if (updates.chatMessages !== undefined) patch.chat_messages = updates.chatMessages;
  if (updates.completed !== undefined) patch.completed = updates.completed;
  if (updates.ended) patch.ended_at = new Date().toISOString();

  const { error } = await (supabase as any)
    .from("micro_lesson_sessions")
    .update(patch)
    .eq("id", sessionId);

  if (error) throw new Error(error.message);
}
