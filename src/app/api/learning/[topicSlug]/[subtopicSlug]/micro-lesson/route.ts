import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import type { WhiteboardStep } from "@/types/whiteboard";

async function resolveSubtopicId(topicSlug: string, subtopicSlug: string): Promise<string | null> {
  const { data: topic } = await supabase
    .from("topics")
    .select("id")
    .eq("slug", topicSlug)
    .limit(1)
    .maybeSingle();

  if (!topic) return null;

  const { data: subtopic } = await supabase
    .from("subtopics")
    .select("id")
    .eq("topic_id", topic.id)
    .eq("slug", subtopicSlug)
    .limit(1)
    .maybeSingle();

  return subtopic?.id ?? null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ topicSlug: string; subtopicSlug: string }> }
) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { topicSlug, subtopicSlug } = await params;
  const subtopicId = await resolveSubtopicId(topicSlug, subtopicSlug);
  if (!subtopicId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: lesson } = await supabase
    .from("micro_lessons")
    .select("*")
    .eq("subtopic_id", subtopicId)
    .limit(1)
    .maybeSingle();

  if (!lesson) {
    return NextResponse.json(null);
  }

  // If generating but stale (> 10 min), treat as stale
  if (lesson.status === "generating") {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (new Date(lesson.updated_at) < tenMinutesAgo) {
      return NextResponse.json({ status: "stale" });
    }
  }

  return NextResponse.json({
    id: lesson.id,
    subtopicId,
    status: lesson.status,
    lessonContent: lesson.lesson_content,
    whiteboardSteps: lesson.whiteboard_steps,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ topicSlug: string; subtopicSlug: string }> }
) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { topicSlug, subtopicSlug } = await params;
  const subtopicId = await resolveSubtopicId(topicSlug, subtopicSlug);
  if (!subtopicId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();

  if (body.action === "start") {
    // Try to insert a new generating row; ignore if already exists
    const { data: inserted } = await supabase
      .from("micro_lessons")
      .insert({
        subtopic_id: subtopicId,
        status: "generating",
        lesson_content: "",
        whiteboard_steps: [],
      })
      .select("id")
      .maybeSingle();

    if (inserted) {
      return NextResponse.json({ acquired: true });
    }

    // Row already exists — check if it's stale
    const { data: existing } = await supabase
      .from("micro_lessons")
      .select("*")
      .eq("subtopic_id", subtopicId)
      .limit(1)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ acquired: false });
    }

    if (existing.status === "generating") {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      if (new Date(existing.updated_at) < tenMinutesAgo) {
        // Reset stale lock
        await supabase
          .from("micro_lessons")
          .update({ status: "generating", updated_at: new Date().toISOString() })
          .eq("subtopic_id", subtopicId);
        return NextResponse.json({ acquired: true });
      }
    }

    return NextResponse.json({ acquired: false });
  }

  if (body.action === "save") {
    const { lessonContent, whiteboardSteps } = body as {
      lessonContent: string;
      whiteboardSteps: WhiteboardStep[];
    };

    await supabase
      .from("micro_lessons")
      .update({
        status: "ready",
        lesson_content: lessonContent,
        whiteboard_steps: whiteboardSteps,
        updated_at: new Date().toISOString(),
      })
      .eq("subtopic_id", subtopicId);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
