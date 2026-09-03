import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ topicSlug: string; subtopicSlug: string }> }
) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { topicSlug, subtopicSlug } = await params;

  const { data: topic } = await supabase
    .from("topics")
    .select("id, slug, name, subject")
    .eq("slug", topicSlug)
    .limit(1)
    .maybeSingle();

  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  const { data: subtopic } = await supabase
    .from("subtopics")
    .select("*")
    .eq("topic_id", topic.id)
    .eq("slug", subtopicSlug)
    .limit(1)
    .maybeSingle();

  if (!subtopic) {
    return NextResponse.json({ error: "Subtopic not found" }, { status: 404 });
  }

  const { data: problemsData } = await (supabase as any)
    .from("problems")
    .select("id, order_index, difficulty, difficulty_level, question_text, question_phonetic, options, correct_option, explanation, solution_steps, hint, detailed_hint, time_recommendation_seconds")
    .eq("source", "sat")
    .eq("subtopic_id", subtopic.id)
    .order("order_index", { ascending: true }) as { data: any[] | null };

  const problems = (problemsData ?? []).map((p) => ({
    id: p.id,
    orderIndex: p.order_index,
    difficulty: p.difficulty,
    difficultyLevel: p.difficulty_level,
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

  return NextResponse.json({
    topic: { slug: topic.slug, name: topic.name, subject: topic.subject },
    subtopic: {
      id: subtopic.id,
      slug: subtopic.slug,
      name: subtopic.name,
      description: subtopic.description,
      difficulty: subtopic.difficulty,
      estimatedMinutes: subtopic.estimated_minutes,
      learningObjectives: subtopic.learning_objectives,
      keyFormulas: subtopic.key_formulas,
      commonMistakes: subtopic.common_mistakes,
      tipsAndTricks: subtopic.tips_and_tricks,
      conceptualOverview: subtopic.conceptual_overview,
    },
    problems,
  });
}
