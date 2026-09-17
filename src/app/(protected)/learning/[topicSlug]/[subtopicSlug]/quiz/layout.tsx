"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { QuizLayoutProvider } from "@/components/learning/quiz/quiz-layout-provider";
import { useStreamingProblems } from "@/hooks/use-streaming-problems";

/** SAT subtopic quiz length. Problems stream into these slots — unseen seeded
 *  first, then freshly generated + written through (never repeated). */
const QUIZ_TARGET = 10;

type PageData = {
  topic: { slug: string; name: string };
  subtopic: { id: string; slug: string; name: string };
};

export default function QuizLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ topicSlug: string; subtopicSlug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Captured once on entry — per-problem navigations drop the query param but
  // this layout persists, so the flag survives /quiz/1 → /quiz/2.
  const [satFocused] = useState(() => searchParams.get("sat") === "1");

  // Metadata only (names + subtopic id for linkage); problems now stream.
  const { data, isLoading, isError } = useQuery<PageData>({
    queryKey: ["learning", params.topicSlug, params.subtopicSlug],
    queryFn: () =>
      fetch(`/api/learning/${params.topicSlug}/${params.subtopicSlug}`).then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      }),
    staleTime: 600_000,
  });

  // Survives a stray hard reload (see quiz-progress-storage.ts). Keyed off
  // the URL params, not `data.subtopic.id` — params are synchronous from
  // the first render, but `data` loads async, and useState's lazy
  // initializer inside useStreamingProblems/useQuizState only ever runs
  // once (on that first render). A key that isn't ready yet at that moment
  // would permanently lock in "nothing to restore," even once the real
  // value arrives a render later.
  const storageKey = `sat:${params.topicSlug}/${params.subtopicSlug}`;

  const { problems, phase, start } = useStreamingProblems({
    topic: data?.topic.name ?? "",
    subtopic: data?.subtopic.name ?? "",
    subject: "math",
    subtopicId: data?.subtopic.id,
    topicSlug: params.topicSlug,
    subtopicSlug: params.subtopicSlug,
    lessonId: data?.subtopic.id,
    storageKey,
  });

  // Begin streaming once metadata (names + linkage) is available.
  useEffect(() => {
    if (data) start({ count: QUIZ_TARGET });
  }, [data, start]);

  useEffect(() => {
    if (isError) {
      toast.error("Failed to load quiz");
      router.push(`/learning/${params.topicSlug}/${params.subtopicSlug}`);
    }
  }, [isError, router, params.topicSlug, params.subtopicSlug]);

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  const subtopicId = data.subtopic.id;
  const isGenerating = phase !== "complete" && phase !== "error";

  return (
    <QuizLayoutProvider
      problems={problems}
      targetCount={QUIZ_TARGET}
      isGenerating={isGenerating}
      topicName={data.topic.name}
      subtopicName={data.subtopic.name}
      subject="math"
      satFocused={satFocused}
      storageKey={storageKey}
      basePath={`/learning/${params.topicSlug}/${params.subtopicSlug}`}
      practiceProblemsUrl={`/api/learning/${params.topicSlug}/${params.subtopicSlug}/practice-problems`}
      onSaveResults={async ({ score, totalQuestions, timeElapsedSeconds, answers, events }) => {
        const res = await fetch("/api/sat-quiz/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subtopicId,
            score,
            totalQuestions,
            timeElapsedSeconds,
            answers,
            events,
          }),
        });
        if (!res.ok) throw new Error("Failed to save results");
        const data = (await res.json().catch(() => null)) as { sessionId?: string } | null;
        return { sessionId: data?.sessionId };
      }}
    >
      {children}
    </QuizLayoutProvider>
  );
}
