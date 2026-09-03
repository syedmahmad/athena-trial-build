import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ topicSlug: string; subtopicSlug: string }> }
) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { topicSlug, subtopicSlug } = await params;
  const { searchParams } = new URL(req.url);
  const difficulty = searchParams.get("difficulty");

  let query = supabase
    .from("problems")
    .select("id, order_index, difficulty, question_text, question_phonetic, options, correct_option, explanation, solution_steps, hint, detailed_hint, time_recommendation_seconds")
    .eq("source", "practice")
    .eq("topic_slug", topicSlug)
    .eq("subtopic_slug", subtopicSlug);

  if (difficulty) {
    query = query.eq("difficulty", difficulty);
  }

  const { data } = await query;

  // Shuffle in JS and return 2
  const shuffled = (data ?? []).sort(() => Math.random() - 0.5).slice(0, 2);

  const rows = shuffled.map((p) => ({
    id: p.id,
    orderIndex: p.order_index,
    difficulty: p.difficulty,
    questionText: p.question_text,
    questionPhonetic: p.question_phonetic ?? undefined,
    options: p.options,
    correctOption: p.correct_option,
    explanation: p.explanation,
    solutionSteps: p.solution_steps,
    hint: p.hint,
    detailedHint: p.detailed_hint ?? undefined,
    timeRecommendationSeconds: p.time_recommendation_seconds,
  }));

  return NextResponse.json({ problems: rows });
}
