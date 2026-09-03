import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { agent_id, skill_name, skill_description, student_context } = body as {
    agent_id: string;
    skill_name: string;
    skill_description?: string;
    student_context?: Record<string, unknown>;
  };

  if (!agent_id || !skill_name) {
    return NextResponse.json(
      { error: "agent_id and skill_name are required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${AGENT_URL}/studio/agents/lesson/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id,
        skill_name,
        skill_description: skill_description || null,
        student_context: student_context || null,
      }),
    });

    if (!res.ok || !res.body) {
      const errorBody = await res.text().catch(() => "no body");
      console.error(
        `[studio/lesson/stream] Agent returned ${res.status}:`,
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
    console.error("[studio/lesson/stream] Error:", err);
    return NextResponse.json(
      {
        error:
          "Studio lesson generator is currently unavailable. Please try again later.",
      },
      { status: 503 }
    );
  }
}
