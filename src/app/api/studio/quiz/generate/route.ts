import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { topic, count, difficulty, session_id, agent_id } = body as {
    topic: string;
    count?: number;
    difficulty?: string;
    session_id?: string;
    agent_id?: string;
  };

  if (!topic) {
    return NextResponse.json(
      { error: "topic is required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${AGENT_URL}/studio/agents/quiz/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        count: count ?? 3,
        difficulty: difficulty ?? "medium",
        session_id: session_id ?? null,
        agent_id: agent_id ?? null,
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "no body");
      console.error(
        `[studio/quiz/generate] Agent returned ${res.status}:`,
        errorBody
      );
      throw new Error(`Agent service returned ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[studio/quiz/generate] Error:", err);
    return NextResponse.json(
      { error: "Failed to generate quiz questions. Please try again." },
      { status: 503 }
    );
  }
}
