import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import { buildRequestMetadata } from "@/lib/agent/request-metadata";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { question, topic, subtopic, lessonSummary, history } = body as {
    question: string;
    topic: string;
    subtopic: string;
    lessonSummary: string;
    history?: { role: string; content: string }[];
  };

  if (!question || !topic || !subtopic) {
    return NextResponse.json(
      { error: "Question, topic, and subtopic are required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${AGENT_URL}/my-learning/lesson/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        topic,
        subtopic,
        lesson_summary: lessonSummary || "",
        history: history || [],
        request_metadata: buildRequestMetadata({ userId, topic, subtopic }),
      }),
    });

    if (!res.ok || !res.body) {
      const errorBody = await res.text().catch(() => "no body");
      throw new Error(`Agent service returned ${res.status}: ${errorBody}`);
    }

    return new Response(res.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[my-learning/lesson/chat/stream] Error:", err);
    return NextResponse.json(
      { error: "AI tutor is currently unavailable. Please try again later." },
      { status: 503 }
    );
  }
}
