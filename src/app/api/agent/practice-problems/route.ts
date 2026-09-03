import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { topic, subtopic, subject } = body as {
    topic: string;
    subtopic: string;
    subject?: string;
  };

  if (!topic || !subtopic) {
    return NextResponse.json(
      { error: "Topic and subtopic are required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${AGENT_URL}/practice-problems`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, subtopic, subject: subject ?? "math" }),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "no body");
      throw new Error(`Agent service returned ${res.status}: ${errorBody}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/agent/practice-problems] Error:", err);
    return NextResponse.json(
      { error: "Failed to generate practice problems. Please try again." },
      { status: 503 }
    );
  }
}
