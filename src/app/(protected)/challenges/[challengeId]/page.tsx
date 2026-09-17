"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Clock } from "lucide-react";
import { QuestionPanel } from "@/components/quiz/question-panel";
import { AnswerPanel } from "@/components/quiz/answer-panel";
import { Button } from "@/components/ui/button";
import { useChallenge, useSubmitChallenge } from "@/hooks/use-challenges";
import { useCurrentUser } from "@/hooks/use-current-user";
import { ChallengeResultsScreen } from "@/components/challenges/challenge-results-screen";
import type { Problem } from "@/components/quiz/types";

function useCountdown(target: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  return Math.max(0, new Date(target).getTime() - now);
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

export default function ChallengeDetailPage() {
  const router = useRouter();
  const params = useParams<{ challengeId: string }>();
  const searchParams = useSearchParams();
  const satFocused = searchParams.get("sat") === "1";
  const dashboardHref = satFocused ? "/sat/dashboard" : "/dashboard";

  const { data, isLoading, refetch } = useChallenge(params.challengeId);
  const submitMutation = useSubmitChallenge(params.challengeId);
  const { data: userData } = useCurrentUser();
  const myUserId = userData?.user.id;

  const countdown = useCountdown(data?.startsAt);
  const startTimeRef = useRef(Date.now());

  // The 1s countdown tick is purely cosmetic — it doesn't imply fresh data.
  // Without this, the page waits for the next 15s poll (useChallenge's
  // refetchInterval) after the timer visually hits 0 before it notices the
  // challenge has actually started, which reads as a stuck/frozen screen.
  const hasRefetchedOnExpiry = useRef(false);
  useEffect(() => {
    if (countdown === 0 && !hasRefetchedOnExpiry.current) {
      hasRefetchedOnExpiry.current = true;
      refetch();
    } else if (countdown !== null && countdown > 0) {
      hasRefetchedOnExpiry.current = false;
    }
  }, [countdown, refetch]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<string, number>>(new Map());

  const myAttempt = useMemo(
    () => data?.attempts.find((a) => a.userId === myUserId),
    [data, myUserId]
  );

  if (isLoading || !data || !myUserId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  const { challenge } = data;

  const backButton = (
    <button
      onClick={() => router.push(`/challenges${satFocused ? "?sat=1" : ""}`)}
      className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ChevronLeft className="h-4 w-4" />
      Challenges
    </button>
  );

  // Still waiting on accept/decline, or the friend declined.
  if (challenge.status === "pending" || challenge.status === "declined") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        {backButton}
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-lg font-semibold">
            {challenge.status === "pending" ? "Waiting for a response" : "Challenge declined"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {challenge.status === "pending"
              ? `${challenge.opponentName || "Your friend"} hasn't responded yet.`
              : `${challenge.opponentName || "Your friend"} declined this challenge.`}
          </p>
        </div>
      </div>
    );
  }

  // Countdown — the problems literally aren't returned by the API yet.
  if (data.startsAt) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        {backButton}
        <div className="rounded-lg border bg-card p-8 text-center">
          <Clock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-lg font-semibold">Not started yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            vs {challenge.opponentId === myUserId ? challenge.challengerName : challenge.opponentName}
            {" — "}
            {challenge.questionCount} questions on {challenge.subtopicName}
          </p>
          <p className="mt-4 text-3xl font-bold tabular-nums">
            {countdown !== null ? formatCountdown(countdown) : "…"}
          </p>
        </div>
      </div>
    );
  }

  // Already submitted (or challenge fully completed) — results/waiting screen.
  if (myAttempt?.submittedAt || challenge.status === "completed") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        {backButton}
        <ChallengeResultsScreen challenge={challenge} attempts={data.attempts} myUserId={myUserId} />
      </div>
    );
  }

  // Taking the quiz.
  const problems = data.problems ?? [];
  const currentProblem = problems[currentIndex];
  if (!currentProblem) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        {backButton}
        <p className="text-sm text-muted-foreground">No questions available.</p>
      </div>
    );
  }

  const asProblem: Problem = {
    id: currentProblem.id,
    orderIndex: currentIndex,
    difficulty: "medium",
    questionText: currentProblem.questionText,
    options: currentProblem.options,
    correctOption: -1,
    explanation: "",
    solutionSteps: [],
    hint: "",
    timeRecommendationSeconds: currentProblem.timeRecommendationSeconds,
  };

  const isLast = currentIndex === problems.length - 1;
  const allAnswered = problems.every((p) => answers.has(p.id));

  function handleSubmit() {
    const timeElapsedSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
    submitMutation.mutate({
      answers: problems.map((p) => ({
        problemId: p.id,
        selectedOption: answers.get(p.id) ?? -1,
      })),
      timeElapsedSeconds,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <button
          onClick={() => router.push(`/challenges${satFocused ? "?sat=1" : ""}`)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Exit
        </button>
        <span className="text-sm font-medium">
          Question {currentIndex + 1} of {problems.length}
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div key={currentProblem.id} className="flex w-full flex-col md:flex-row md:divide-x">
          <QuestionPanel problem={asProblem} questionNumber={currentIndex + 1} />
          <AnswerPanel
            problem={asProblem}
            questionNumber={currentIndex + 1}
            selectedOption={answers.get(currentProblem.id)}
            isMarked={false}
            onToggleMark={() => {}}
            showMark={false}
            direction={1}
            disabled={submitMutation.isPending}
            onSelect={(i) =>
              setAnswers((prev) => new Map(prev).set(currentProblem.id, i))
            }
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-t px-4 py-3">
        <Button
          variant="outline"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
        >
          Back
        </Button>
        {isLast ? (
          <Button disabled={!allAnswered || submitMutation.isPending} onClick={handleSubmit}>
            {submitMutation.isPending ? "Submitting…" : "Submit"}
          </Button>
        ) : (
          <Button onClick={() => setCurrentIndex((i) => Math.min(problems.length - 1, i + 1))}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
