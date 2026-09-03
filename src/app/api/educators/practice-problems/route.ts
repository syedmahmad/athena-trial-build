import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import type { AssignmentQuestion } from "@/lib/db/queries/educators";

/**
 * Teacher-only: pull N practice problems from the Athena problem bank for a
 * topic/subtopic, in the AssignmentQuestion shape (includes correctIndex +
 * explanation — never expose this endpoint publicly).
 */
export async function GET(req: Request) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const topicSlug = searchParams.get("topicSlug");
  const subtopicSlug = searchParams.get("subtopicSlug");
  const count = Math.max(
    1,
    Math.min(20, Number(searchParams.get("count") ?? 6) || 6)
  );
  if (!topicSlug || !subtopicSlug) {
    return NextResponse.json(
      { error: "topicSlug and subtopicSlug are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("problems")
    .select("id, question_text, options, correct_option, explanation")
    .eq("source", "practice")
    .eq("topic_slug", topicSlug)
    .eq("subtopic_slug", subtopicSlug);
  if (error) {
    console.error("[educators/practice-problems]", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }

  const shuffled = (data ?? []).sort(() => Math.random() - 0.5).slice(0, count);
  const questions: AssignmentQuestion[] = shuffled.map((p) => ({
    id: p.id,
    prompt: p.question_text,
    options: (p.options as string[]) ?? [],
    correctIndex: p.correct_option,
    explanation: p.explanation ?? null,
  }));

  return NextResponse.json({ questions });
}
