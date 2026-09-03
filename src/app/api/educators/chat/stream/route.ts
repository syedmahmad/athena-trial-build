import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

/** SSE proxy: "Ask Athena" roster Q&A with class performance context. */
export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    messages?: { role: string; content: string }[];
    context?: Record<string, unknown>;
  };
  if (!body.messages?.length) {
    return NextResponse.json({ error: "messages are required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${AGENT_URL}/educator/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: body.messages,
        context: body.context ?? {},
      }),
    });
    if (!res.ok || !res.body) {
      const errorBody = await res.text().catch(() => "no body");
      console.error(`[educators/chat/stream] Agent returned ${res.status}:`, errorBody);
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
    console.error("[educators/chat/stream] Error:", err);
    return NextResponse.json(
      { error: "Chat is currently unavailable. Please try again." },
      { status: 503 }
    );
  }
}
