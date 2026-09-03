import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

type QuizQuestion = { prompt: string; answer: string };
type QuizResult = { title: string; intro: string; questions: QuizQuestion[] };

/** Generate homework as a structured per-question quiz (title + directions +
 *  questions, each with a teacher-only answer). Non-streaming — the agent
 *  returns the whole quiz via tool-use. Accepts the same upload attachments as
 *  the streaming generator. */
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
    const res = await fetch(`${AGENT_URL}/educator/homework/quiz`, {
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
    if (!res.ok) {
      const errorBody = await res.text().catch(() => "no body");
      console.error(
        `[educators/homework/quiz] Agent returned ${res.status}:`,
        errorBody
      );
      throw new Error(`Agent service returned ${res.status}`);
    }
    const quiz = (await res.json()) as QuizResult;
    return NextResponse.json(quiz);
  } catch (err) {
    console.error("[educators/homework/quiz] Error:", err);
    return NextResponse.json(
      { error: "Quiz generation is currently unavailable. Please try again." },
      { status: 503 }
    );
  }
}
