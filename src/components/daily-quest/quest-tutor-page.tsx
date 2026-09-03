"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuestContext } from "./quest-context";
import { QuizTutorFab } from "@/components/quiz/quiz-tutor-fab";

export function QuestTutorPageContent() {
  const router = useRouter();
  const params = useParams<{ problemNumber: string }>();
  const problemNumFromUrl = Math.max(1, parseInt(params.problemNumber, 10) || 1);
  const ctx = useQuestContext();

  // Sync quiz state to URL param on mount
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    const targetIndex = problemNumFromUrl - 1;
    if (targetIndex !== ctx.currentIndex && targetIndex >= 0 && targetIndex < ctx.problems.length) {
      ctx.goTo(targetIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentProblem = ctx.problems[ctx.currentIndex];
  const questionPhase = currentProblem ? ctx.getQuestionPhase(currentProblem.id) : "question";
  const problemNum = ctx.currentIndex + 1;

  // Navigate away when the problem is locked (correct answer given via tutor)
  useEffect(() => {
    if (currentProblem && ctx.lockedIds.has(currentProblem.id)) {
      const nextNum = Math.min(ctx.currentIndex + 2, ctx.problems.length);
      setTimeout(() => {
        router.push(`/quest/${nextNum}`);
      }, 1200);
    }
  }, [ctx.lockedIds, currentProblem, ctx.currentIndex, ctx.problems.length, router]);

  if (!currentProblem) {
    router.push(`/quest/${problemNum}`);
    return null;
  }

  // Convert quest problem to quiz Problem shape
  const asProblem = {
    id: currentProblem.id,
    orderIndex: currentProblem.orderIndex,
    difficulty: `Level ${currentProblem.difficultyLevel}`,
    questionText: currentProblem.questionText,
    options: currentProblem.options,
    correctOption: currentProblem.correctOption,
    explanation: currentProblem.explanation,
    solutionSteps: currentProblem.solutionSteps.map((s) => ({
      step: s.step,
      instruction: s.instruction,
      math: s.math ?? "",
    })),
    hint: currentProblem.hint,
    detailedHint: currentProblem.detailedHint,
    timeRecommendationSeconds: 90,
  };

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <QuizTutorFab
        key={`${currentProblem.id}-tutor`}
        topicName={currentProblem.topicName}
        subtopicName={currentProblem.subtopicName}
        currentProblem={asProblem}
        questionNumber={problemNum}
        studentAnswer={ctx.answers.get(currentProblem.id)}
        feedbackState={ctx.feedbackMap.get(currentProblem.id)}
        defaultOpen={true}
        autoOpen={questionPhase === "tutor"}
        autoMessage="The student got this question wrong three times. Please explain this concept step by step."
        onSelectAnswer={(i) => ctx.handleSelectAnswer(currentProblem.id, i)}
        onClose={() => router.push(`/quest/${problemNum}`)}
      />
    </div>
  );
}
