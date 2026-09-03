import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import { buildRequestMetadata } from "@/lib/agent/request-metadata";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    question,
    topic,
    subtopic,
    lessonSummary,
    lessonSteps,
    metadata,
    currentStepIndex,
    history,
    imageBase64,
    imageMediaType,
    satFocused,
  } = body as {
    question: string;
    topic: string;
    subtopic: string;
    lessonSummary: string;
    lessonSteps?: Record<string, unknown>[];
    metadata?: Record<string, unknown>;
    currentStepIndex?: number;
    history?: { role: string; content: string }[];
    /** Optional vision image — base64 data + media type. Forwarded
     *  to the agents service which builds a Claude vision content
     *  block via Agno. */
    imageBase64?: string;
    imageMediaType?: string;
    /** SAT surface opt-in — restores SAT-instructor prompt framing. */
    satFocused?: boolean;
  };

  if (!question || !topic || !subtopic) {
    return NextResponse.json(
      { error: "Question, topic, and subtopic are required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${AGENT_URL}/micro-lesson/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        topic,
        subtopic,
        lesson_summary: lessonSummary || "",
        lesson_steps: lessonSteps || [],
        metadata: metadata || {},
        current_step_index: currentStepIndex ?? 0,
        history: history || [],
        sat_focused: !!satFocused,
        request_metadata: buildRequestMetadata({ userId, topic, subtopic }),
        // Both must be present to forward — partial data is dropped
        // on the client side already; defending here for clarity.
        ...(imageBase64 && imageMediaType
          ? { image_base64: imageBase64, image_media_type: imageMediaType }
          : {}),
      }),
    });

    if (!res.ok || !res.body) {
      const errorBody = await res.text().catch(() => "no body");
      console.error(
        `[agent/micro-lesson/chat/stream] Agent returned ${res.status}:`,
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
    console.error("[agent/micro-lesson/chat/stream] Error:", err);
    return NextResponse.json(
      {
        error:
          "AI tutor is currently unavailable. Please try again later.",
      },
      { status: 503 }
    );
  }
}
