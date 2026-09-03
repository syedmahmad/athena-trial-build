import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    topicSlug?: string;
    subtopicSlug?: string;
    excludeProblemIds?: string[];
    deckIndex?: number;
  };

  const { topicSlug, subtopicSlug, excludeProblemIds = [], deckIndex } = body;
  if (!topicSlug || !subtopicSlug || typeof deckIndex !== "number") {
    return NextResponse.json(
      { error: "topicSlug, subtopicSlug, and deckIndex are required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${AGENT_URL}/flashcards/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic_slug: topicSlug,
        subtopic_slug: subtopicSlug,
        exclude_problem_ids: excludeProblemIds,
        deck_index: deckIndex,
      }),
    });

    if (!res.ok) {
      throw new Error(`Agent service returned ${res.status}`);
    }

    const json = await res.json();
    return NextResponse.json(json);
  } catch (err) {
    console.error("[agent/flashcards/regenerate] Error:", err);
    return NextResponse.json(
      { error: "Could not regenerate card" },
      { status: 503 }
    );
  }
}
