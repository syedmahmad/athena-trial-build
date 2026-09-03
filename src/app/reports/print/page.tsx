import { notFound } from "next/navigation";
import { QuizReport } from "@/components/reports/quiz-report";
import { MicroLessonReport } from "@/components/reports/micro-lesson-report";
import { FlashcardReport } from "@/components/reports/flashcard-report";
import { verifyReportToken } from "@/lib/reports/sign-token";
import { takeCachedReportPayload } from "@/lib/reports/payload-cache";
import { quizDemo } from "@/lib/reports/__fixtures__/quiz-demo";
import { microLessonDemo } from "@/lib/reports/__fixtures__/micro-lesson-demo";
import type { CachedReportPayload } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  t?: string | string[];
  demo?: string | string[];
}>;

function pick(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function loadDemoPayload(demo: string): CachedReportPayload | null {
  if (demo === "quiz" || demo === "1") return quizDemo;
  if (demo === "micro-lesson") return microLessonDemo;
  return null;
}

export default async function ReportPrintPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const token = pick(params.t);
  const demo = pick(params.demo);

  let payload: CachedReportPayload | null = null;

  if (demo) {
    payload = loadDemoPayload(demo);
  } else if (token) {
    const verified = verifyReportToken(token);
    if (verified) payload = await takeCachedReportPayload(verified.pid);
  }

  if (!payload) notFound();

  if (payload.kind === "quiz") {
    return <QuizReport payload={payload} />;
  }
  if (payload.kind === "flashcard") {
    return <FlashcardReport payload={payload} />;
  }
  return <MicroLessonReport payload={payload} />;
}
