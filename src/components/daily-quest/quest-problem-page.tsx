"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useQuestContext } from "./quest-context";
import { Toolbar } from "@/components/quiz/toolbar";
import { SegmentProgressBar } from "@/components/quiz/segment-progress-bar";
import { QuestionPanel } from "@/components/quiz/question-panel";
import { AnswerPanel } from "@/components/quiz/answer-panel";
import { BottomBar } from "@/components/quiz/bottom-bar";
import { Calculator } from "@/components/quiz/calculator";
import { StuckModal } from "@/components/quiz/stuck-modal";
import { QuestResultsScreen } from "./quest-results-screen";
import { MathContent } from "@/components/quiz/math-content";

export function QuestProblemPageContent() {
  const router = useRouter();
  const params = useParams<{ problemNumber: string }>();
  const problemNum = Math.max(1, parseInt(params.problemNumber, 10) || 1);
  const ctx = useQuestContext();

  const [calcOpen, setCalcOpen] = useState(false);
  const [showStuckModal, setShowStuckModal] = useState(false);

  // Sync URL <-> currentIndex
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!syncedRef.current) {
      syncedRef.current = true;
      const targetIndex = problemNum - 1;
      if (targetIndex !== ctx.currentIndex && targetIndex >= 0 && targetIndex < ctx.problems.length) {
        ctx.goTo(targetIndex);
      }
      return;
    }
    router.push(`/quest/${ctx.currentIndex + 1}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.currentIndex]);

  const currentProblem = ctx.problems[ctx.currentIndex];
  const questionPhase = currentProblem ? ctx.getQuestionPhase(currentProblem.id) : "question";

  // Show stuck modal when question enters tutor phase (only once per problem)
  useEffect(() => {
    if (questionPhase === "tutor" && currentProblem && !ctx.stuckModalShownIds.has(currentProblem.id)) {
      setShowStuckModal(true);
    }
  }, [questionPhase, currentProblem, ctx.stuckModalShownIds]);

  const handleStuckModalComplete = useCallback(() => {
    if (currentProblem) ctx.markStuckModalShown(currentProblem.id);
    setShowStuckModal(false);
    router.push(`/quest/${ctx.currentIndex + 1}/tutor`);
  }, [router, ctx, currentProblem]);

  if (!currentProblem) return null;

  const isLocked = ctx.lockedIds.has(currentProblem.id) || currentProblem.isCorrect === true;

  // Convert quest problem to quiz Problem shape for reused components
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

  if (ctx.phase === "completed") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <QuestResultsScreen />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <Toolbar
        displayTime={ctx.displayTime}
        isLow={ctx.isTimerLow}
        timerHidden={ctx.timerHidden}
        onToggleTimer={ctx.toggleTimerHidden}
        calcOpen={calcOpen}
        onToggleCalc={() => setCalcOpen((o) => !o)}
        onClose={() => router.push("/dashboard")}
        hasAnswers={ctx.answers.size > 0}
        subtopicName={currentProblem.subtopicName}
      />
      <SegmentProgressBar
        total={ctx.problems.length}
        currentIndex={ctx.currentIndex}
        getStatus={ctx.getQuestionStatus}
        onNavigate={() => {}}
      />

      {/* Subtopic badge */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/50">
        <span className="text-xs font-medium text-muted-foreground">
          {currentProblem.topicName}
        </span>
        <span className="text-xs text-muted-foreground/50">/</span>
        <span className="text-xs font-medium text-primary">
          {currentProblem.subtopicName}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          Lv.{currentProblem.difficultyLevel}
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-full flex-col md:flex-row md:divide-x">
          <QuestionPanel
            problem={asProblem}
            questionNumber={ctx.currentIndex + 1}
          />
          <AnswerPanel
            problem={asProblem}
            questionNumber={ctx.currentIndex + 1}
            selectedOption={
              ctx.answers.get(currentProblem.id) ??
              (currentProblem.selectedOption ?? undefined)
            }
            isMarked={false}
            onSelect={(i) => ctx.handleSelectAnswer(currentProblem.id, i)}
            onToggleMark={() => {}}
            direction={ctx.direction}
            feedbackState={ctx.feedbackMap.get(currentProblem.id)}
            disabled={isLocked}
          >
            {/* Hint (1st wrong) */}
            {(questionPhase === "hint" || questionPhase === "hint2" || questionPhase === "tutor") && currentProblem.hint && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 rounded-lg border border-athena-amber/40 bg-athena-amber/10 px-4 py-3"
              >
                <p className="text-xs font-bold uppercase tracking-widest text-athena-amber mb-1">
                  Hint
                </p>
                <div className="text-sm text-muted-foreground">
                  <MathContent content={currentProblem.hint} />
                </div>
              </motion.div>
            )}

            {/* Stronger hint (2nd wrong) */}
            {(questionPhase === "hint2" || questionPhase === "tutor") && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 rounded-lg border border-athena-amber/60 bg-athena-amber/15 px-4 py-3"
              >
                <p className="text-xs font-bold uppercase tracking-widest text-athena-amber mb-1">
                  Try This Approach
                </p>
                <div className="text-sm text-muted-foreground">
                  <MathContent
                    content={
                      currentProblem.detailedHint ||
                      (currentProblem.solutionSteps.length > 0
                        ? `Try this approach: ${currentProblem.solutionSteps[0].instruction}`
                        : currentProblem.explanation.slice(0, 200) +
                          (currentProblem.explanation.length > 200 ? "..." : ""))
                    }
                  />
                </div>
              </motion.div>
            )}
          </AnswerPanel>
        </div>
      </div>

      <BottomBar
        currentIndex={ctx.currentIndex}
        total={ctx.problems.length}
        unansweredCount={ctx.problems.length - ctx.lockedIds.size}
        onBack={ctx.goBack}
        onNext={ctx.goNext}
        onGoTo={ctx.goTo}
        onSubmit={ctx.handleComplete}
        getStatus={ctx.getQuestionStatus}
        sequential={false}
        nextDisabled={false}
      />

      <AnimatePresence>
        {calcOpen && ctx.phase === "active" && <Calculator />}
      </AnimatePresence>

      <AnimatePresence>
        {showStuckModal && (
          <StuckModal onComplete={handleStuckModalComplete} />
        )}
      </AnimatePresence>
    </div>
  );
}
