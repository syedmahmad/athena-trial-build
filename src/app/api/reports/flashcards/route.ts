import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import { putCachedReportPayload } from "@/lib/reports/payload-cache";
import { newPayloadId, signReportToken } from "@/lib/reports/sign-token";
import { renderReportPdf } from "@/lib/reports/pdf-renderer";
import type {
  CachedReportPayload,
  FlashcardDeckPayload,
  FlashcardForPrint,
} from "@/lib/reports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  topicName?: string;
  subtopicName?: string;
  cards?: FlashcardForPrint[];
};

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "deck"
  );
}

function getInternalOrigin(): string {
  if (process.env.REPORT_RENDER_ORIGIN) return process.env.REPORT_RENDER_ORIGIN;
  const port = process.env.PORT || "3000";
  return `http://127.0.0.1:${port}`;
}

const ALLOWED_LETTERS = new Set(["A", "B", "C", "D"]);

function sanitizeCards(raw: unknown): FlashcardForPrint[] {
  if (!Array.isArray(raw)) return [];
  const out: FlashcardForPrint[] = [];
  for (const card of raw) {
    if (!card || typeof card !== "object") continue;
    const c = card as Record<string, unknown>;
    const problemId = typeof c.problemId === "string" ? c.problemId : "";
    const difficulty = typeof c.difficulty === "string" ? c.difficulty : "medium";
    const questionText =
      typeof c.questionText === "string" ? c.questionText : "";
    const correctLetter =
      typeof c.correctLetter === "string" && ALLOWED_LETTERS.has(c.correctLetter)
        ? (c.correctLetter as "A" | "B" | "C" | "D")
        : "A";
    const explanation =
      typeof c.explanation === "string" ? c.explanation : "";
    const optionsRaw = Array.isArray(c.options) ? c.options : [];
    const stepsRaw = Array.isArray(c.solutionSteps) ? c.solutionSteps : [];
    const options = optionsRaw
      .map((opt) => {
        if (!opt || typeof opt !== "object") return null;
        const o = opt as Record<string, unknown>;
        const letter = typeof o.letter === "string" ? o.letter : "";
        const text = typeof o.text === "string" ? o.text : "";
        if (!ALLOWED_LETTERS.has(letter)) return null;
        return { letter: letter as "A" | "B" | "C" | "D", text };
      })
      .filter((o): o is { letter: "A" | "B" | "C" | "D"; text: string } => o !== null);
    const solutionSteps = stepsRaw
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!problemId || !questionText) continue;
    out.push({
      problemId,
      difficulty,
      questionText,
      options,
      correctLetter,
      explanation,
      solutionSteps,
    });
  }
  return out.slice(0, 60); // hard ceiling to bound PDF render time
}

export async function POST(req: Request) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const topicName = (body.topicName ?? "").trim() || "Flashcards";
  const subtopicName = (body.subtopicName ?? "").trim() || "Deck";
  const cards = sanitizeCards(body.cards);
  if (cards.length === 0) {
    return NextResponse.json({ error: "No cards to print" }, { status: 400 });
  }

  try {
    const deck: FlashcardDeckPayload = { topicName, subtopicName, cards };
    const cached: CachedReportPayload = {
      kind: "flashcard",
      userId: user.id,
      generatedAt: new Date().toISOString(),
      deck,
    };

    const payloadId = newPayloadId();
    await putCachedReportPayload(payloadId, cached);
    const token = signReportToken({ userId: user.id, payloadId });

    const filename = `athena-flashcards-${slugify(subtopicName)}.pdf`;
    const pdf = await renderReportPdf({
      token,
      origin: getInternalOrigin(),
    });

    return new Response(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[reports/flashcards] failed:", err);
    return NextResponse.json(
      { error: "Failed to generate deck PDF. Please try again." },
      { status: 500 }
    );
  }
}
