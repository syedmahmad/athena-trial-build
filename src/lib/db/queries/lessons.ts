import { supabase } from "@/lib/supabase/client";

export async function getLessonById(lessonId: string) {
  const { data } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    problemId: data.problem_id,
    title: data.title,
    content: data.content,
    estimatedDurationMinutes: data.estimated_duration_minutes,
    createdAt: new Date(data.created_at),
  };
}

export async function getLessonByProblemId(problemId: string) {
  const { data } = await supabase
    .from("lessons")
    .select("*")
    .eq("problem_id", problemId)
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    problemId: data.problem_id,
    title: data.title,
    content: data.content,
    estimatedDurationMinutes: data.estimated_duration_minutes,
    createdAt: new Date(data.created_at),
  };
}
