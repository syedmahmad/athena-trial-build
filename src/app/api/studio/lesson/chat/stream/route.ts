import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { agent_id, session_id, question, lesson_summary, lesson_steps, history } =
    body as {
      agent_id: string;
      session_id: string;
      question: string;
      lesson_summary: string;
      lesson_steps?: Record<string, unknown>[];
      history?: { role: string; content: string }[];
    };

  if (!agent_id || !session_id || !question) {
    return NextResponse.json(
      { error: "agent_id, session_id, and question are required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${AGENT_URL}/studio/agents/lesson/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id,
        session_id,
        question,
        lesson_summary: lesson_summary || "",
        lesson_steps: lesson_steps || [],
        history: history || [],
      }),
    });

    if (!res.ok || !res.body) {
      const errorBody = await res.text().catch(() => "no body");
      console.error(
        `[studio/lesson/chat/stream] Agent returned ${res.status}:`,
        errorBody
      );
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
    console.error("[studio/lesson/chat/stream] Error:", err);
    return NextResponse.json(
      {
        error:
          "Studio chat is currently unavailable. Please try again later.",
      },
      { status: 503 }
    );
  }
}
