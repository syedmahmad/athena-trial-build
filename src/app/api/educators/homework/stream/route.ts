import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

/** SSE proxy: streamed homework generation (title on first line, then body). */
export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    prompt?: string;
    attachments?: {
      kind: "image" | "pdf" | "text";
      name?: string;
      mediaType?: string;
      data: string;
    }[];
  };
  const attachments = (body.attachments ?? []).filter((a) => a?.data);
  if (!body.prompt?.trim() && attachments.length === 0) {
    return NextResponse.json(
      { error: "prompt or attachments required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${AGENT_URL}/educator/homework/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: body.prompt ?? "",
        attachments: attachments.map((a) => ({
          kind: a.kind,
          name: a.name ?? "",
          media_type: a.mediaType ?? "",
          data: a.data,
        })),
      }),
    });
    if (!res.ok || !res.body) {
      const errorBody = await res.text().catch(() => "no body");
      console.error(`[educators/homework/stream] Agent returned ${res.status}:`, errorBody);
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
    console.error("[educators/homework/stream] Error:", err);
    return NextResponse.json(
      { error: "Generation is currently unavailable. Please try again." },
      { status: 503 }
    );
  }
}
