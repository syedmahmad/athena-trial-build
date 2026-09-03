import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { message, history, available_agents } = body as {
    message: string;
    history: { role: string; content: string }[];
    available_agents: { id: string; display_name: string; tagline?: string; domain?: string }[];
  };

  if (!message) {
    return NextResponse.json(
      { error: "Message is required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${AGENT_URL}/studio/agents/triage/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: history || [],
        available_agents: available_agents || [],
      }),
    });

    if (!res.ok || !res.body) {
      const errorBody = await res.text().catch(() => "no body");
      console.error(`[studio/triage/chat] Agent returned ${res.status}:`, errorBody);
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
    console.error("[studio/triage/chat] Error:", err);
    return NextResponse.json(
      { error: "Triage agent is currently unavailable. Please try again later." },
      { status: 503 }
    );
  }
}
