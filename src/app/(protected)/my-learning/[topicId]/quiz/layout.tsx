"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { useMyLearningTopic } from "@/hooks/use-my-learning-topic";
import { QuizLayoutProvider } from "@/components/learning/quiz/quiz-layout-provider";
import { useStreamingProblems } from "@/hooks/use-streaming-problems";

/** Custom-topic quiz length. Problems stream into these slots — unseen seeded
 *  first, then freshly generated + written through (never repeated). */
const QUIZ_TARGET = 10;

export default function MyLearningQuizLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ topicId: string }>();
  const router = useRouter();

  const { data, isLoading, isError } = useMyLearningTopic(params.topicId);

  const { problems, phase, start } = useStreamingProblems({
    topic: data?.topic.title ?? "",
    subtopic: data?.topic.title ?? "",
    subject: "general",
    customTopicId: params.topicId,
    lessonId: params.topicId,
  });

  useEffect(() => {
    if (data) start({ count: QUIZ_TARGET });
  }, [data, start]);

  useEffect(() => {
    if (isError) {
      toast.error("Failed to load quiz");
      router.push(`/my-learning/${params.topicId}`);
    }
  }, [isError, router, params.topicId]);

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  const { topic } = data;
  const topicId = params.topicId;
  const isGenerating = phase !== "complete" && phase !== "error";

  return (
    <QuizLayoutProvider
      problems={problems}
      targetCount={QUIZ_TARGET}
      isGenerating={isGenerating}
      topicName={topic.title}
      subtopicName={topic.title}
      basePath={`/my-learning/${topicId}`}
      practiceProblemsUrl={`/api/my-learning/topics/${topicId}/practice-problems`}
      onSaveResults={async ({ score, totalQuestions, timeElapsedSeconds, answers, events }) => {
        const res = await fetch("/api/my-learning/quiz/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicId,
            score,
            totalQuestions,
            timeElapsedSeconds,
            answers: answers.map((a) => ({
              questionId: a.problemId,
              selectedOption: a.selectedOption,
              isCorrect: a.isCorrect,
              responseTimeMs: a.responseTimeMs,
              wrongCount: a.wrongCount,
              hintUsed: a.hintUsed,
              tutorUsed: a.tutorUsed,
              practiceCompleted: a.practiceCompleted,
            })),
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
