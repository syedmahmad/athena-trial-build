import { supabase } from "@/lib/supabase/client";

// tutor_character_id / tutor_voice_id are optional on the input type
// so callers can still pass rows fetched against pre-migration schemas
// without a cast. The migration adds the columns; until applied the
// fields just stay null at runtime.
function mapPrefs(row: {
  id: string;
  user_id: string;
  lesson_delivery: string | null;
  theme: string | null;
  name: string | null;
  grade: string | null;
  learner_types: string[] | null;
  interests: string[] | null;
  struggling_topic: string | null;
  tutor_character_id?: string | null;
  tutor_voice_id?: string | null;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: row.id,
    userId: row.user_id,
    lessonDelivery: row.lesson_delivery as "view_now" | "queue_for_later" | null,
    theme: row.theme as "light" | "dark" | "system" | null,
    name: row.name,
    grade: row.grade,
    learnerTypes: row.learner_types,
    interests: row.interests,
    strugglingTopic: row.struggling_topic,
    tutorCharacterId: row.tutor_character_id ?? null,
    tutorVoiceId: row.tutor_voice_id ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function getUserPreferences(userId: string) {
  const { data } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  return data ? mapPrefs(data) : null;
}

export async function upsertUserPreferences(
  userId: string,
  data: Partial<{
    lessonDelivery: "view_now" | "queue_for_later";
    theme: "light" | "dark" | "system";
    name: string;
    grade: string;
    learnerTypes: string[];
    interests: string[];
    strugglingTopic: string;
    tutorCharacterId: string | null;
    tutorVoiceId: string | null;
  }>
) {
  const { data: row } = await supabase
    .from("user_preferences")
    .upsert(
      {
        user_id: userId,
        ...(data.lessonDelivery !== undefined && { lesson_delivery: data.lessonDelivery }),
        ...(data.theme !== undefined && { theme: data.theme }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.grade !== undefined && { grade: data.grade }),
        ...(data.learnerTypes !== undefined && { learner_types: data.learnerTypes }),
        ...(data.interests !== undefined && { interests: data.interests }),
        ...(data.strugglingTopic !== undefined && { struggling_topic: data.strugglingTopic }),
        ...(data.tutorCharacterId !== undefined && { tutor_character_id: data.tutorCharacterId }),
        ...(data.tutorVoiceId !== undefined && { tutor_voice_id: data.tutorVoiceId }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  return row ? mapPrefs(row) : null;
}
