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
    topic,
    subtopic,
    description,
    learningObjectives,
    keyFormulas,
    commonMistakes,
    tipsAndTricks,
    conceptualOverview,
    satFocused,
  } = body as {
    topic: string;
    subtopic: string;
    description?: string;
    learningObjectives?: string[];
    keyFormulas?: { latex: string; description: string }[];
    commonMistakes?: { mistake: string; correction: string; why: string }[];
    tipsAndTricks?: string[];
    conceptualOverview?: {
      definition: string;
      realWorldExample: string;
      satContext: string;
    };
    /** SAT surface opt-in — restores SAT-instructor prompt framing. */
    satFocused?: boolean;
  };

  if (!topic || !subtopic) {
    return NextResponse.json(
      { error: "Topic and subtopic are required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${AGENT_URL}/micro-lesson/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        subtopic,
        description: description || "",
        learning_objectives: learningObjectives || [],
        key_formulas: keyFormulas || [],
        common_mistakes: commonMistakes || [],
        tips_and_tricks: tipsAndTricks || [],
        conceptual_overview: conceptualOverview
          ? {
              definition: conceptualOverview.definition || "",
              real_world_example: conceptualOverview.realWorldExample || "",
              sat_context: conceptualOverview.satContext || "",
            }
          : null,
        sat_focused: !!satFocused,
        request_metadata: buildRequestMetadata({ userId, topic, subtopic }),
      }),
    });

    if (!res.ok || !res.body) {
      const errorBody = await res.text().catch(() => "no body");
      console.error(
        `[agent/micro-lesson/stream] Agent returned ${res.status}:`,
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
    console.error("[agent/micro-lesson/stream] Error:", err);
    return NextResponse.json(
      {
        error:
          "AI lesson generator is currently unavailable. Please try again later.",
      },
      { status: 503 }
    );
  }
}
