"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useStartFullSat } from "@/hooks/use-full-sat";
import { FullSatProvider } from "@/components/full-sat/full-sat-provider";
import type {
  FullSatTestProblem,
  FullSatAnswer,
  FullSatAttempt,
  FullSatTest,
} from "@/types/full-sat";

type LoadedData = {
  attempt: FullSatAttempt;
  test: FullSatTest;
  problems: FullSatTestProblem[];
  answers: FullSatAnswer[];
};

export default function FullSatAttemptLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();
  const [data, setData] = useState<LoadedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Fetch attempt data via the start endpoint (it handles resume)
        const res = await fetch("/api/full-sat/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testId: "resume" }),
        });

        if (!res.ok) {
          // If no in-progress attempt, redirect to landing
          router.push("/full-sat");
          return;
        }

        const json = await res.json();
        setData({
          attempt: {
            id: json.attemptId,
            userId: "",
            testId: json.test.id,
            status: "in_progress",
            rwRawScore: null,
            rwScaledScore: null,
            mathRawScore: null,
            mathScaledScore: null,
            totalScore: null,
            rwModule1Correct: 0,
            mathModule1Correct: 0,
            rwTimeSeconds: 0,
            mathTimeSeconds: 0,
            totalTimeSeconds: 0,
            currentSection: "reading_writing",
            currentModule: 1,
            currentQuestion: 0,
            startedAt: new Date().toISOString(),
            completedAt: null,
            createdAt: new Date().toISOString(),
          },
          test: json.test,
          problems: json.problems,
          answers: json.answers,
        });
      } catch {
        toast.error("Failed to load test");
        router.push("/full-sat");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.attemptId, router]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <FullSatProvider
      attempt={data.attempt}
      test={data.test}
      problems={data.problems}
      initialAnswers={data.answers}
    >
      {children}
    </FullSatProvider>
  );
}
