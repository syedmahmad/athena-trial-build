import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import { buildRequestMetadata } from "@/lib/agent/request-metadata";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    topicSlug?: string;
    subtopicSlug?: string;
    count?: number;
  };

  const { topicSlug, subtopicSlug, count } = body;
  if (!topicSlug || !subtopicSlug) {
    return NextResponse.json(
      { error: "topicSlug and subtopicSlug are required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${AGENT_URL}/flashcards/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic_slug: topicSlug,
        subtopic_slug: subtopicSlug,
        count: typeof count === "number" ? count : 12,
        request_metadata: buildRequestMetadata({
          userId,
          topic: topicSlug,
          subtopic: subtopicSlug,
        }),
      }),
    });

    if (!res.ok || !res.body) {
      const errorBody = await res.text().catch(() => "no body");
      console.error(
        `[agent/flashcards/stream] Agent returned ${res.status}:`,
        errorBody
      );
      throw new Error(`Agent service returned ${res.status}`);
    }

    return new Response(res.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[agent/flashcards/stream] Error:", err);
    return NextResponse.json(
      {
        error:
          "Flashcard generator is currently unavailable. Please try again later.",
      },
      { status: 503 }
    );
  }
}
