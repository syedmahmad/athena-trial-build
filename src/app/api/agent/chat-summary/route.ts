import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import { buildRequestMetadata } from "@/lib/agent/request-metadata";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

type SummaryMessage = { role: "user" | "tutor"; content: string };

/**
 * Generate a one-line summary of a chat side-quest. Used by the
 * micro-lesson divider that sits between the lesson canvas and the
 * appended tutor explanation, labeling the section so the student can
 * recognize what the side-quest covered at a glance after collapsing it.
 *
 * Proxies to the agents service `/chat-summary` endpoint which runs a
 * fast model (Claude Haiku) over the conversation and returns a 5-12
 * word descriptor. Failure mode is non-fatal — the client falls back
 * to a derived label if this returns an error.
 */
export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { messages?: SummaryMessage[] };
  const messages = body.messages ?? [];

  if (messages.length === 0) {
    return NextResponse.json({ summary: "" });
  }

  try {
    const res = await fetch(`${AGENT_URL}/chat-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        request_metadata: buildRequestMetadata({ userId }),
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "no body");
      console.error(`[agent/chat-summary] Agent returned ${res.status}:`, errorBody);
      return NextResponse.json({ summary: "" }, { status: 200 });
    }

    const data = (await res.json()) as { summary?: string };
    return NextResponse.json({ summary: data.summary ?? "" });
  } catch (err) {
    console.error("[agent/chat-summary] Error:", err);
    return NextResponse.json({ summary: "" }, { status: 200 });
  }
}
