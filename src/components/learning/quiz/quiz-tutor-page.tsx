"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { useQuizRouteContext } from "@/components/learning/quiz/quiz-route-context";
import { QuizTutorFab } from "@/components/quiz/quiz-tutor-fab";
import { StuckModal } from "@/components/quiz/stuck-modal";
import { TutorPracticeCard } from "@/components/quiz/tutor-practice-card";
import type { Problem } from "@/components/quiz/types";

export function QuizTutorPageContent() {
  const router = useRouter();
  const params = useParams<{ problemNumber: string }>();
  const problemNumFromUrl = Math.max(1, parseInt(params.problemNumber, 10) || 1);
  const {
    problems,
    topicName,
    subtopicName,
    basePath,
    practiceProblemsUrl,
    quiz,
    feedbackMap,
    handleSelectAnswer,
    practiceEntryModalShownIds,
    markPracticeEntryModalShown,
  } = useQuizRouteContext();

  // Sync quiz state to URL param on mount (handles direct navigation / refresh)
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    const targetIndex = problemNumFromUrl - 1;
    if (targetIndex !== quiz.currentIndex && targetIndex >= 0 && targetIndex < problems.length) {
      quiz.goTo(targetIndex);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentProblem = problems[quiz.currentIndex];
  const questionPhase = currentProblem ? quiz.getQuestionPhase(currentProblem.id) : "question";
  const problemNum = quiz.currentIndex + 1;
  const quizProblemUrl = `${basePath}/quiz/${problemNum}`;

  const [currentPracticeProblem, setCurrentPracticeProblem] = useState<Problem | null>(null);

  const [showPracticeEntryModal, setShowPracticeEntryModal] = useState(
    () =>
      questionPhase === "practice" &&
      !!currentProblem &&
      !practiceEntryModalShownIds.has(currentProblem.id)
  );

  // When user answers correctly on tutor, phase becomes "practice" — show entry modal once
  useEffect(() => {
    if (
      questionPhase === "practice" &&
      currentProblem &&
      !practiceEntryModalShownIds.has(currentProblem.id)
    ) {
      setShowPracticeEntryModal(true);
    }
  }, [questionPhase, currentProblem, practiceEntryModalShownIds]);

  if (!currentProblem) {
    router.push(quizProblemUrl);
    return null;
  }

  // Build difficulty-aware practice URL
  const practiceUrl = practiceProblemsUrl
    ? `${practiceProblemsUrl}${currentProblem.difficulty ? `?difficulty=${encodeURIComponent(currentProblem.difficulty)}` : ""}`
    : undefined;

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <QuizTutorFab
        key={`${currentProblem.id}-tutor`}
        topicName={topicName}
        subtopicName={subtopicName}
        currentProblem={currentProblem}
        questionNumber={problemNum}
        studentAnswer={quiz.answers.get(currentProblem.id)}
        feedbackState={feedbackMap.get(currentProblem.id)}
        defaultOpen={true}
        autoOpen={questionPhase === "tutor"}
        autoMessage={
          questionPhase === "tutor"
            ? "The student got this question wrong twice. Please explain this concept step by step."
            : undefined
        }
        onSelectAnswer={(i) => handleSelectAnswer(currentProblem.id, i)}
        onClose={() => router.push(quizProblemUrl)}
        practiceContextOverride={
          currentPracticeProblem
            ? {
                topic: topicName,
                subtopic: subtopicName,
                questionText: currentPracticeProblem.questionText,
                options: currentPracticeProblem.options,
                hint: currentPracticeProblem.hint,
                solutionSteps: currentPracticeProblem.solutionSteps,
                correctOption: currentPracticeProblem.correctOption,
              }
            : undefined
        }
        practiceContent={
          questionPhase === "practice" && !showPracticeEntryModal ? (
            <TutorPracticeCard
              practiceProblemsUrl={practiceUrl}
              onCurrentProblemChange={setCurrentPracticeProblem}
              onComplete={() => {
                quiz.completePractice();
                router.push(`${basePath}/quiz/${quiz.currentIndex + 2}`);
              }}
              onNeedsMicroLesson={() =>
                router.push(`${basePath}/micro-lesson`)
              }
            />
          ) : undefined
        }
      />
      <AnimatePresence>
        {questionPhase === "practice" && showPracticeEntryModal && (
          <StuckModal
            title="You got this right!"
            description="Let's practice a couple more just to be sure"
            onComplete={() => {
              markPracticeEntryModalShown(currentProblem.id);
              setShowPracticeEntryModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
