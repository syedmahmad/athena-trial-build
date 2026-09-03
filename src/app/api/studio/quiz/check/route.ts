import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { question_id, selected_option } = body as {
    question_id: string;
    selected_option: number;
  };

  if (!question_id || selected_option === undefined) {
    return NextResponse.json(
      { error: "question_id and selected_option are required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${AGENT_URL}/studio/agents/quiz/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_id, selected_option }),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "no body");
      console.error(
        `[studio/quiz/check] Agent returned ${res.status}:`,
        errorBody
      );
      throw new Error(`Agent service returned ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[studio/quiz/check] Error:", err);
    return NextResponse.json(
      { error: "Failed to check answer. Please try again." },
      { status: 503 }
    );
  }
}
