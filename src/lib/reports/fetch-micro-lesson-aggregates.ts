import { supabase } from "@/lib/supabase/client";
import type { MicroLessonAggregates } from "./types";

type SubtopicRow = {
  id: string;
  name: string;
  topics: { name: string } | null;
};

export async function fetchMicroLessonAggregates(
  sessionId: string,
  userId: string
): Promise<MicroLessonAggregates | null> {
  const { data: session } = await (supabase as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (k: string, v: string) => {
          eq: (k: string, v: string) => {
            maybeSingle: () => Promise<{
              data: {
                id: string;
                subtopic_id: string;
                duration_seconds: number | null;
                steps_viewed: number | null;
                total_steps: number | null;
                checkins_correct: number | null;
                checkins_total: number | null;
                chat_messages: number | null;
                completed: boolean | null;
                created_at: string;
              } | null;
            }>;
          };
        };
      };
    };
  })
    .from("micro_lesson_sessions")
    .select(
      "id, subtopic_id, duration_seconds, steps_viewed, total_steps, checkins_correct, checkins_total, chat_messages, completed, created_at"
    )
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!session) return null;

  let topicName = "";
  let subtopicName = "";
  const { data: subtopic } = await supabase
    .from("subtopics")
    .select("id, name, topics!inner(name)")
    .eq("id", session.subtopic_id)
    .maybeSingle();
  if (subtopic) {
    const row = subtopic as unknown as SubtopicRow;
    subtopicName = row.name;
    topicName = row.topics?.name ?? "";
  }

  let skill: MicroLessonAggregates["skill"] = null;
  const { data: skillRow } = await supabase
    .from("subsection_skills")
    .select("level, xp, streak_correct, streak_wrong")
    .eq("user_id", userId)
    .eq("subtopic_id", session.subtopic_id)
    .maybeSingle();
  if (skillRow) {
    skill = {
      level: skillRow.level,
      xp: skillRow.xp,
      streakCorrect: skillRow.streak_correct,
      streakWrong: skillRow.streak_wrong,
    };
  }

  return {
    sessionId: session.id,
    topicName,
    subtopicName,
    durationSeconds: session.duration_seconds ?? 0,
    stepsViewed: session.steps_viewed ?? 0,
    totalSteps: session.total_steps ?? 0,
    checkinsCorrect: session.checkins_correct ?? 0,
    checkinsTotal: session.checkins_total ?? 0,
    chatMessageCount: session.chat_messages ?? 0,
    completed: !!session.completed,
    createdAt: session.created_at,
    skill,
  };
}
