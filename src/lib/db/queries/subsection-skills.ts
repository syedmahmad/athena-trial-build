import { supabase } from "@/lib/supabase/client";
import type { SubsectionSkill, SectionCategory } from "@/types/adaptive";

function mapSkill(row: Record<string, unknown>): SubsectionSkill {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    subtopicId: row.subtopic_id as string,
    sectionCategory: row.section_category as SectionCategory,
    level: row.level as number,
    xp: row.xp as number,
    totalAttempts: row.total_attempts as number,
    correctAttempts: row.correct_attempts as number,
    last10: (row.last_10 as boolean[]) ?? [],
    streakCorrect: row.streak_correct as number,
    streakWrong: row.streak_wrong as number,
    lastSeenAt: row.last_seen_at as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getSubsectionSkill(
  userId: string,
  subtopicId: string
): Promise<SubsectionSkill | null> {
  const { data } = await (supabase as any)
    .from("subsection_skills")
    .select("*")
    .eq("user_id", userId)
    .eq("subtopic_id", subtopicId)
    .limit(1)
    .single();

  return data ? mapSkill(data) : null;
}

export async function getAllSubsectionSkills(
  userId: string
): Promise<SubsectionSkill[]> {
  const { data } = await (supabase as any)
    .from("subsection_skills")
    .select("*")
    .eq("user_id", userId)
    .order("level", { ascending: true });

  return (data ?? []).map(mapSkill);
}

export async function getSubsectionSkillsBySection(
  userId: string,
  sectionCategory: SectionCategory
): Promise<SubsectionSkill[]> {
  const { data } = await (supabase as any)
    .from("subsection_skills")
    .select("*")
    .eq("user_id", userId)
    .eq("section_category", sectionCategory)
    .order("level", { ascending: true });

  return (data ?? []).map(mapSkill);
}

export async function upsertSubsectionSkill(
  userId: string,
  subtopicId: string,
  sectionCategory: SectionCategory,
  updates: Partial<{
    level: number;
    xp: number;
    totalAttempts: number;
    correctAttempts: number;
    last10: boolean[];
    streakCorrect: number;
    streakWrong: number;
    lastSeenAt: string;
  }>
): Promise<SubsectionSkill> {
  const row: Record<string, unknown> = {
    user_id: userId,
    subtopic_id: subtopicId,
    section_category: sectionCategory,
    updated_at: new Date().toISOString(),
  };

  if (updates.level !== undefined) row.level = updates.level;
  if (updates.xp !== undefined) row.xp = updates.xp;
  if (updates.totalAttempts !== undefined) row.total_attempts = updates.totalAttempts;
  if (updates.correctAttempts !== undefined) row.correct_attempts = updates.correctAttempts;
  if (updates.last10 !== undefined) row.last_10 = updates.last10;
  if (updates.streakCorrect !== undefined) row.streak_correct = updates.streakCorrect;
  if (updates.streakWrong !== undefined) row.streak_wrong = updates.streakWrong;
  if (updates.lastSeenAt !== undefined) row.last_seen_at = updates.lastSeenAt;

  const { data, error } = await (supabase as any)
    .from("subsection_skills")
    .upsert(row, { onConflict: "user_id,subtopic_id" })
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to upsert subsection skill");
  return mapSkill(data);
}

export async function initializeAllSkills(userId: string): Promise<SubsectionSkill[]> {
  // Fetch all subtopics with their topic's subject
  const { data: subtopics } = await supabase
    .from("subtopics")
    .select("id, topic_id, topics!inner(subject)")
    .order("order_index");

  if (!subtopics || subtopics.length === 0) return [];

  // Check which skills already exist
  const { data: existing } = await (supabase as any)
    .from("subsection_skills")
    .select("subtopic_id")
    .eq("user_id", userId);

  const existingIds = new Set((existing ?? []).map((r: any) => r.subtopic_id as string));

  const toInsert = subtopics
    .filter((s) => !existingIds.has(s.id))
    .map((s) => {
      const topic = s.topics as unknown as { subject: string };
      const subject = topic?.subject ?? "math";
      const sectionCategory =
        subject === "math" ? "Math" : "ReadingWriting";
      return {
        user_id: userId,
        subtopic_id: s.id,
        section_category: sectionCategory,
      };
    });

  if (toInsert.length === 0) {
    return getAllSubsectionSkills(userId);
  }

  const { error } = await (supabase as any).from("subsection_skills").insert(toInsert);
  if (error) throw new Error(error.message);

  return getAllSubsectionSkills(userId);
}
