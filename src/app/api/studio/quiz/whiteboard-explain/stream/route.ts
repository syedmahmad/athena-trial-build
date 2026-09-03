import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { question_id, student_option } = body as {
    question_id: string;
    student_option?: number;
  };

  if (!question_id) {
    return NextResponse.json(
      { error: "question_id is required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(
      `${AGENT_URL}/studio/agents/quiz/whiteboard-explain/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_id,
          student_option: student_option ?? null,
        }),
      }
    );

    if (!res.ok || !res.body) {
      const errorBody = await res.text().catch(() => "no body");
      console.error(
        `[studio/quiz/whiteboard-explain] Agent returned ${res.status}:`,
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
    console.error("[studio/quiz/whiteboard-explain] Error:", err);
    return NextResponse.json(
      { error: "Whiteboard explanation unavailable. Please try again." },
      { status: 503 }
    );
  }
}
