import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

/**
 * Voice → option-index matcher fallback. Used by the lesson's voice
 * dispatch when the regex layer can't decide which option a student's
 * utterance is picking ("it's x equals five" against options like
 * "x = 5"). Proxies to the agents `/answer-match` endpoint which
 * runs a fast Haiku-class model.
 *
 * Returns `{ index: number }` where index is the picked option's
 * zero-based index, or -1 if the transcript doesn't match any option
 * (e.g., the student asked a clarifying question instead). The
 * caller treats -1 / failures the same way: fall through to chat.
 */
export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    transcript?: string;
    options?: string[];
    question?: string;
  };

  if (!body.transcript || !Array.isArray(body.options) || body.options.length === 0) {
    return NextResponse.json({ error: "transcript and options required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${AGENT_URL}/answer-match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: body.transcript,
        options: body.options,
        question: body.question ?? "",
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[agent/answer-match] Agent returned ${res.status}:`, detail);
      return NextResponse.json({ index: -1 }, { status: 200 });
    }
    const data = (await res.json()) as { index?: number };
    return NextResponse.json({ index: typeof data.index === "number" ? data.index : -1 });
  } catch (err) {
    console.error("[agent/answer-match] Error:", err);
    return NextResponse.json({ index: -1 }, { status: 200 });
  }
}
