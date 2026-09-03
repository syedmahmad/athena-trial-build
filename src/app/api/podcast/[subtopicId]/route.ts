import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase/client";
import { buildRequestMetadata } from "@/lib/agent/request-metadata";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

// Mirrors PodcastScript in agents/app/run_time/sat/podcast_agent.py.
// We validate here as a safety net in case the agents service ever
// returns malformed JSON; the Pydantic validation upstream is the
// primary guard.
const SpeakerSchema = z.object({
  id: z.enum(["host_male", "host_female", "guest"]),
  name: z.string(),
  role: z.enum(["host", "guest"]),
  bio: z.string().nullable().optional(),
});

const DialogueLineSchema = z.object({
  speaker_id: z.enum(["host_male", "host_female", "guest"]),
  text: z.string(),
  tone_hint: z
    .enum(["neutral", "excited", "thoughtful", "warm", "curious"])
    .nullable()
    .optional(),
});

const PodcastScriptSchema = z.object({
  title: z.string(),
  summary: z.string(),
  speakers: z.array(SpeakerSchema).min(2).max(3),
  has_guest: z.boolean(),
  lines: z.array(DialogueLineSchema).min(1),
  estimated_duration_minutes: z.number(),
});

type PodcastScriptRow = {
  id: string;
  subtopicId: string;
  status: "generating" | "ready" | "failed";
  title: string;
  summary: string;
  speakers: z.infer<typeof SpeakerSchema>[];
  lines: z.infer<typeof DialogueLineSchema>[];
  hasGuest: boolean;
  estimatedDurationMinutes: number | null;
};

const STALE_LOCK_MS = 5 * 60 * 1000;

type SubtopicRow = {
  id: string;
  name: string;
  description: string | null;
  learning_objectives: string[] | null;
  key_formulas: { latex: string; description: string }[] | null;
  common_mistakes: { mistake: string; correction: string; why: string }[] | null;
  tips_and_tricks: string[] | null;
  conceptual_overview: {
    definition?: string;
    real_world_example?: string;
    sat_context?: string;
  } | null;
  topic_id: string;
};

async function loadSubtopicContext(subtopicId: string) {
  const { data: subtopic } = await supabase
    .from("subtopics")
    .select(
      "id, name, description, learning_objectives, key_formulas, common_mistakes, tips_and_tricks, conceptual_overview, topic_id",
    )
    .eq("id", subtopicId)
    .limit(1)
    .maybeSingle<SubtopicRow>();

  if (!subtopic) return null;

  const { data: topic } = await supabase
    .from("topics")
    .select("id, slug, name")
    .eq("id", subtopic.topic_id)
    .limit(1)
    .maybeSingle<{ id: string; slug: string; name: string }>();

  if (!topic) return null;

  return { subtopic, topic };
}

function rowToClient(row: Record<string, unknown>): PodcastScriptRow {
  return {
    id: row.id as string,
    subtopicId: row.subtopic_id as string,
    status: row.status as PodcastScriptRow["status"],
    title: row.title as string,
    summary: row.summary as string,
    speakers: row.speakers as PodcastScriptRow["speakers"],
    lines: row.lines as PodcastScriptRow["lines"],
    hasGuest: Boolean(row.has_guest),
    estimatedDurationMinutes:
      typeof row.estimated_duration_minutes === "number"
        ? row.estimated_duration_minutes
        : null,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ subtopicId: string }> },
) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subtopicId } = await params;

  const { data: row } = await supabase
    .from("podcast_scripts")
    .select("*")
    .eq("subtopic_id", subtopicId)
    .limit(1)
    .maybeSingle();

  if (!row) {
    return NextResponse.json(null);
  }

  // Treat a stuck "generating" row as gone, so the client can retry POST.
  if (row.status === "generating") {
    const updatedAt = new Date(row.updated_at as string).getTime();
    if (Date.now() - updatedAt > STALE_LOCK_MS) {
      return NextResponse.json({ status: "stale" });
    }
  }

  return NextResponse.json(rowToClient(row));
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ subtopicId: string }> },
) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subtopicId } = await params;

  // ── Lock: insert generating row, or claim a stale lock ────────────────
  const { data: inserted } = await supabase
    .from("podcast_scripts")
    .insert({
      subtopic_id: subtopicId,
      status: "generating",
      title: "",
      summary: "",
      speakers: [],
      lines: [],
      has_guest: false,
    })
    .select("id")
    .maybeSingle();

  if (!inserted) {
    // Row already exists. Allow re-generation only if stale.
    const { data: existing } = await supabase
      .from("podcast_scripts")
      .select("*")
      .eq("subtopic_id", subtopicId)
      .limit(1)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { error: "Insert failed and no existing row" },
        { status: 500 },
      );
    }

    if (existing.status === "ready") {
      return NextResponse.json(rowToClient(existing));
    }

    // Only an actively-generating row touched recently should block a
    // retry. A 'failed' row (or a stale 'generating' lock) must be
    // reclaimable immediately, otherwise a retry after a failed run
    // returns 409 for the whole stale window.
    if (existing.status === "generating") {
      const updatedAt = new Date(existing.updated_at as string).getTime();
      if (Date.now() - updatedAt < STALE_LOCK_MS) {
        return NextResponse.json(
          { error: "Generation in progress", status: "generating" },
          { status: 409 },
        );
      }
    }

    // Reclaim stale lock.
    await supabase
      .from("podcast_scripts")
      .update({
        status: "generating",
        updated_at: new Date().toISOString(),
      })
      .eq("subtopic_id", subtopicId);
  }

  // ── Load subtopic context ─────────────────────────────────────────────
  const ctx = await loadSubtopicContext(subtopicId);
  if (!ctx) {
    await supabase
      .from("podcast_scripts")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("subtopic_id", subtopicId);
    return NextResponse.json({ error: "Subtopic not found" }, { status: 404 });
  }

  // ── Call agents service ───────────────────────────────────────────────
  try {
    const res = await fetch(`${AGENT_URL}/podcast-script`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: ctx.topic.slug,
        subtopic: ctx.subtopic.name,
        description: ctx.subtopic.description ?? "",
        learning_objectives: ctx.subtopic.learning_objectives ?? [],
        key_formulas: ctx.subtopic.key_formulas ?? [],
        common_mistakes: ctx.subtopic.common_mistakes ?? [],
        tips_and_tricks: ctx.subtopic.tips_and_tricks ?? [],
        conceptual_overview: ctx.subtopic.conceptual_overview ?? null,
        request_metadata: buildRequestMetadata({
          userId,
          topic: ctx.topic.slug,
          subtopic: ctx.subtopic.name,
        }),
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "no body");
      console.error(
        `[api/podcast] Agent returned ${res.status}:`,
        errorBody,
      );
      await supabase
        .from("podcast_scripts")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("subtopic_id", subtopicId);
      return NextResponse.json(
        {
          error:
            "Podcast generator is currently unavailable. Please try again.",
        },
        { status: 503 },
      );
    }

    const rawJson = await res.json();
    const parsed = PodcastScriptSchema.safeParse(rawJson);
    if (!parsed.success) {
      console.error(
        "[api/podcast] Agent returned invalid script shape:",
        parsed.error.issues,
      );
      await supabase
        .from("podcast_scripts")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("subtopic_id", subtopicId);
      return NextResponse.json(
        { error: "Generator returned invalid script" },
        { status: 502 },
      );
    }

    const script = parsed.data;

    // ── Save ──────────────────────────────────────────────────────────
    const { data: saved } = await supabase
      .from("podcast_scripts")
      .update({
        status: "ready",
        title: script.title,
        summary: script.summary,
        speakers: script.speakers,
        lines: script.lines,
        has_guest: script.has_guest,
        estimated_duration_minutes: script.estimated_duration_minutes,
        updated_at: new Date().toISOString(),
      })
      .eq("subtopic_id", subtopicId)
      .select("*")
      .maybeSingle();

    if (!saved) {
      return NextResponse.json(
        { error: "Save failed" },
        { status: 500 },
      );
    }

    return NextResponse.json(rowToClient(saved));
  } catch (err) {
    console.error("[api/podcast] Error:", err);
    await supabase
      .from("podcast_scripts")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("subtopic_id", subtopicId);
    return NextResponse.json(
      { error: "Failed to generate podcast" },
      { status: 500 },
    );
  }
}
