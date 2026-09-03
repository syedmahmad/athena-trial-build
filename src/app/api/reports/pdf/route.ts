import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import { buildRequestMetadata } from "@/lib/agent/request-metadata";
import { fetchQuizAggregates } from "@/lib/reports/fetch-quiz-aggregates";
import { fetchMicroLessonAggregates } from "@/lib/reports/fetch-micro-lesson-aggregates";
import {
  putCachedReportPayload,
} from "@/lib/reports/payload-cache";
import { newPayloadId, signReportToken } from "@/lib/reports/sign-token";
import { renderReportPdf } from "@/lib/reports/pdf-renderer";
import type {
  CachedReportPayload,
  MicroLessonSnapshot,
  ReportAnalysis,
  ReportKind,
} from "@/lib/reports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

type RequestBody = {
  kind: ReportKind;
  sessionId: string;
  snapshot?: MicroLessonSnapshot;
};

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "report"
  );
}

function getInternalOrigin(): string {
  if (process.env.REPORT_RENDER_ORIGIN) return process.env.REPORT_RENDER_ORIGIN;
  const port = process.env.PORT || "3000";
  // Loopback: Playwright runs in the same container as Next.js.
  return `http://127.0.0.1:${port}`;
}

async function callAnalyzeEndpoint(opts: {
  kind: ReportKind;
  aggregates: unknown;
  snapshot?: MicroLessonSnapshot;
  userId: string;
  topicName: string;
  subtopicName: string;
  sessionId: string;
}): Promise<ReportAnalysis> {
  const res = await fetch(`${AGENT_URL}/reports/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: opts.kind,
      aggregates: opts.aggregates,
      snapshot: opts.snapshot ?? null,
      request_metadata: buildRequestMetadata({
        userId: opts.userId,
        topic: opts.topicName,
        subtopic: opts.subtopicName,
        lessonId: opts.sessionId,
      }),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Agent /reports/analyze returned ${res.status}: ${body}`);
  }
  return (await res.json()) as ReportAnalysis;
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

  if (
    !body ||
    (body.kind !== "quiz" && body.kind !== "micro-lesson") ||
    !body.sessionId ||
    typeof body.sessionId !== "string"
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    let cached: CachedReportPayload;

    if (body.kind === "quiz") {
      const aggregates = await fetchQuizAggregates(body.sessionId, user.id);
      if (!aggregates) {
        return NextResponse.json({ error: "Quiz session not found" }, { status: 404 });
      }
      const analysis = await callAnalyzeEndpoint({
        kind: "quiz",
        aggregates,
        userId: clerkId,
        topicName: aggregates.topicName,
        subtopicName: aggregates.subtopicName,
        sessionId: aggregates.sessionId,
      });
      cached = {
        kind: "quiz",
        userId: user.id,
        generatedAt: new Date().toISOString(),
        aggregates,
        analysis,
      };
    } else {
      const aggregates = await fetchMicroLessonAggregates(body.sessionId, user.id);
      if (!aggregates) {
        return NextResponse.json({ error: "Micro-lesson session not found" }, { status: 404 });
      }
      // Snapshot is the only path to chat transcript + per-step
      // attempts. Empty fallback so the analyzer still produces a
      // coarse report rather than 500ing.
      const snapshot: MicroLessonSnapshot = body.snapshot ?? {
        chatMessages: [],
        perStepAttempts: [],
        stepTimings: [],
        learningObjectives: [],
        keyFormulas: [],
        topicName: aggregates.topicName,
        subtopicName: aggregates.subtopicName,
      };
      const analysis = await callAnalyzeEndpoint({
        kind: "micro-lesson",
        aggregates,
        snapshot,
        userId: clerkId,
        topicName: aggregates.topicName,
        subtopicName: aggregates.subtopicName,
        sessionId: aggregates.sessionId,
      });
      cached = {
        kind: "micro-lesson",
        userId: user.id,
        generatedAt: new Date().toISOString(),
        aggregates,
        snapshot,
        analysis,
      };
    }

    // View mode: skip the Playwright/PDF render entirely and return the report
    // payload as JSON so the client can render the same React report
    // compositions inline (no token, cache, or PDF capture needed).
    const wantsView = new URL(req.url).searchParams.get("mode") === "view";
    if (wantsView) {
      return NextResponse.json(cached);
    }

    const payloadId = newPayloadId();
    await putCachedReportPayload(payloadId, cached);
    const token = signReportToken({ userId: user.id, payloadId });

    const subtopicName =
      cached.kind === "quiz"
        ? cached.aggregates.subtopicName
        : cached.aggregates.subtopicName;
    const filename = `athena-report-${slugify(subtopicName)}.pdf`;

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
    console.error("[reports/pdf] failed:", err);
    return NextResponse.json(
      { error: "Failed to generate report. Please try again." },
      { status: 500 }
    );
  }
}
