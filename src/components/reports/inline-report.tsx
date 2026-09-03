"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { QuizReport } from "@/components/reports/quiz-report";
import { MicroLessonReport } from "@/components/reports/micro-lesson-report";
import { FlashcardReport } from "@/components/reports/flashcard-report";
import type {
  CachedReportPayload,
  MicroLessonSnapshot,
  ReportKind,
} from "@/lib/reports/types";

type Props = {
  kind: ReportKind;
  sessionId: string | null | undefined;
  snapshot?: MicroLessonSnapshot;
};

/**
 * Renders the report inline (below the results) using the same React
 * compositions the PDF pipeline captures. Fetches the report payload from
 * `/api/reports/pdf?mode=view`, which runs the analysis but skips the
 * Playwright/PDF step. The report is forced onto a light surface so it reads
 * as a clean document regardless of the surrounding theme.
 */
export function InlineReport({ kind, sessionId, snapshot }: Props) {
  const { data, isLoading, isError } = useQuery<CachedReportPayload>({
    queryKey: ["report-view", kind, sessionId],
    queryFn: async () => {
      const res = await fetch("/api/reports/pdf?mode=view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, sessionId, snapshot }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      return (await res.json()) as CachedReportPayload;
    },
    enabled: !!sessionId,
    staleTime: Infinity,
    retry: 1,
  });

  useEffect(() => {
    if (isError) toast.error("Couldn't load the report.");
  }, [isError]);

  if (!sessionId) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Building your report…
      </div>
    );
  }

  if (isError || !data) return null;

  return (
    <div className="light flex justify-center overflow-x-auto rounded-xl border bg-muted/30 py-6">
      {data.kind === "quiz" ? (
        <QuizReport payload={data} />
      ) : data.kind === "flashcard" ? (
        <FlashcardReport payload={data} />
      ) : (
        <MicroLessonReport payload={data} />
      )}
    </div>
  );
}
