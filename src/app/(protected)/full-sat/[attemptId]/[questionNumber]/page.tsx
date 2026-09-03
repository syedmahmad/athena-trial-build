"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { useFullSatContext } from "@/components/full-sat/full-sat-context";
import { Toolbar } from "@/components/quiz/toolbar";
import { SegmentProgressBar } from "@/components/quiz/segment-progress-bar";
import { QuestionPanel } from "@/components/quiz/question-panel";
import { AnswerPanel } from "@/components/quiz/answer-panel";
import { BottomBar } from "@/components/quiz/bottom-bar";
import { Calculator } from "@/components/quiz/calculator";

export default function FullSatQuestionPage() {
  const router = useRouter();
  const params = useParams<{ attemptId: string; questionNumber: string }>();
  const questionNum = Math.max(1, parseInt(params.questionNumber, 10) || 1);
  const ctx = useFullSatContext();

  const [calcOpen, setCalcOpen] = useState(false);
  const [timerHidden, setTimerHidden] = useState(false);

  // Sync URL <-> currentIndex
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!syncedRef.current) {
      syncedRef.current = true;
      const targetIndex = questionNum - 1;
      if (
        targetIndex !== ctx.currentIndex &&
        targetIndex >= 0 &&
        targetIndex < ctx.totalQuestions
      ) {
        ctx.goTo(targetIndex);
      }
      return;
    }
    router.push(`/full-sat/${params.attemptId}/${ctx.currentIndex + 1}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.currentIndex]);

  const currentProblem = ctx.currentProblem;
  if (!currentProblem) return null;

  // Convert to quiz Problem shape for reused components
  const asProblem = {
    id: currentProblem.problemId,
    orderIndex: currentProblem.orderIndex,
    difficulty: currentProblem.difficulty,
    questionText: currentProblem.questionText,
    options: currentProblem.options,
    correctOption: -1, // Don't reveal correct answer during test
    explanation: "",
    solutionSteps: [],
    hint: "",
    detailedHint: undefined,
    timeRecommendationSeconds: 90,
  };

  const isLow = ctx.timeLeft < 300; // 5 minutes warning
  const isMathSection = ctx.currentSection === "math";

  // Determine section boundaries for the bottom bar
  // R&W: questions 1-54, Math: questions 55-98
  const sectionStart = isMathSection ? 54 : 0;
  const sectionEnd = isMathSection ? 98 : 54;
  const sectionTotal = sectionEnd - sectionStart;
  const sectionIndex = ctx.currentIndex - sectionStart;

  const handleSubmitOrFinishSection = () => {
    if (isMathSection) {
      ctx.submitTest();
    } else {
      ctx.finishSection();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <Toolbar
        displayTime={ctx.displayTime}
        isLow={isLow}
        timerHidden={timerHidden}
        onToggleTimer={() => setTimerHidden((h) => !h)}
        calcOpen={calcOpen}
        onToggleCalc={() => setCalcOpen((o) => !o)}
        onClose={() => router.push("/full-sat")}
        hasAnswers={ctx.answeredCount > 0}
        subtopicName={`${ctx.sectionLabel} - ${ctx.moduleLabel}`}
        showCalc={isMathSection}
        title="Full SAT Practice Test"
      />

      <SegmentProgressBar
        total={sectionTotal}
        currentIndex={sectionIndex}
        getStatus={(i) => ctx.getQuestionStatus(i + sectionStart)}
        onNavigate={() => {}}
      />

      {/* Section + module label */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/50">
        <span className="text-xs font-semibold text-muted-foreground">
          {ctx.sectionLabel}
        </span>
        <span className="text-xs text-muted-foreground/50">|</span>
        <span className="text-xs font-medium text-primary">
          {ctx.moduleLabel}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          Q{ctx.currentIndex + 1} of {ctx.totalQuestions}
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-full flex-col md:flex-row md:divide-x">
          <QuestionPanel
            problem={asProblem}
            questionNumber={sectionIndex + 1}
          />
          <AnswerPanel
            problem={asProblem}
            questionNumber={sectionIndex + 1}
            selectedOption={ctx.answers.get(currentProblem.problemId)}
            isMarked={false}
            onSelect={(i) => ctx.handleSelectAnswer(currentProblem.problemId, i)}
            onToggleMark={() => {}}
            direction={ctx.direction}
            disabled={false}
            showMark={false}
          />
        </div>
      </div>

      <BottomBar
        currentIndex={sectionIndex}
        total={sectionTotal}
        unansweredCount={
          Array.from({ length: sectionTotal }, (_, i) =>
            ctx.getQuestionStatus(i + sectionStart)
          ).filter((s) => s === "unanswered").length
        }
        onBack={() => {
          if (sectionIndex > 0) ctx.goBack();
        }}
        onNext={() => {
          if (sectionIndex < sectionTotal - 1) ctx.goNext();
        }}
        onGoTo={(i) => ctx.goTo(i + sectionStart)}
        onSubmit={handleSubmitOrFinishSection}
        getStatus={(i) => ctx.getQuestionStatus(i + sectionStart)}
        sequential={false}
        nextDisabled={false}
      />

      <AnimatePresence>
        {calcOpen && isMathSection && <Calculator />}
      </AnimatePresence>
    </div>
  );
}
