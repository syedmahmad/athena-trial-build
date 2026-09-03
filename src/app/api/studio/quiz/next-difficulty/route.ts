import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { session_id } = body as { session_id: string };

  if (!session_id) {
    return NextResponse.json(
      { error: "session_id is required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(
      `${AGENT_URL}/studio/agents/quiz/next-difficulty`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id }),
      }
    );

    if (!res.ok) {
      throw new Error(`Agent service returned ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[studio/quiz/next-difficulty] Error:", err);
    return NextResponse.json(
      { error: "Failed to determine difficulty." },
      { status: 503 }
    );
  }
}
