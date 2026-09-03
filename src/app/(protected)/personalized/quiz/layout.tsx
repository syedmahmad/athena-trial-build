"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { QuizLayoutProvider } from "@/components/learning/quiz/quiz-layout-provider";
import type { Problem } from "@/components/quiz/types";
import { PERSONALIZED_SESSION_KEY } from "@/app/(protected)/personalized/page";

type SubtopicMatch = {
  topicSlug: string;
  topicName: string;
  subtopicSlug: string;
  subtopicName: string;
  subtopicId: string;
  weight: number;
  problemCount: number;
  rationale: string;
};

type Classification = {
  subject: "math" | "reading-writing";
  matches: SubtopicMatch[];
  notes: string | null;
};

type PersonalizedSession = {
  classification: Classification;
  problems: (Problem & { topicSlug: string; subtopicSlug: string })[];
};

export default function PersonalizedQuizLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [session, setSession] = useState<PersonalizedSession | null>(null);
  const [status, setStatus] = useState<"loading" | "redirecting" | "ready">(
    "loading"
  );

  useEffect(() => {
    const raw = sessionStorage.getItem(PERSONALIZED_SESSION_KEY);
    if (!raw) {
      setStatus("redirecting");
      toast.error("Start a personalized session first.");
      router.replace("/personalized");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as PersonalizedSession;
      if (!parsed.problems || parsed.problems.length === 0) {
        setStatus("redirecting");
        router.replace("/personalized");
        return;
      }
      setSession(parsed);
      setStatus("ready");
    } catch {
      setStatus("redirecting");
      router.replace("/personalized");
    }
  }, [router]);

  if (status !== "ready" || !session) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  // For a single-subtopic match show that subtopic's names; for a mixed
  // session use a synthetic "Personalized" topic + a count-based subtopic
  // label. The quiz UI surfaces these in headers/summary.
  const single =
    session.classification.matches.length === 1
      ? session.classification.matches[0]
      : null;
  const topicName = single?.topicName ?? "Personalized";
  const subtopicName =
    single?.subtopicName ??
    `${session.classification.matches.length} subtopics`;

  return (
    <QuizLayoutProvider
      problems={session.problems}
      topicName={topicName}
      subtopicName={subtopicName}
      subject={session.classification.subject === "reading-writing" ? "reading-writing" : "math"}
      basePath="/personalized"
      enablePostQuizPractice={false}
      onSaveResults={async () => {
        // Personalized sessions are ephemeral — nothing to persist. The
        // submit button still triggers this callback so the quiz UI
        // transitions to its results state.
      }}
    >
      {children}
    </QuizLayoutProvider>
  );
}
