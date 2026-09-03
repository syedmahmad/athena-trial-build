"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Check,
  X,
  ChevronRight,
  Lightbulb,
  BookOpen,
  Trophy,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { MathContent } from "@/components/quiz/math-content";
import { WhiteboardCanvas } from "@/components/whiteboard/whiteboard-canvas";
import { useStepPlayer } from "@/hooks/use-step-player";
import { cn } from "@/lib/utils";
import type { QuizQuestion, CheckResult } from "@/hooks/use-studio-quiz";
import type { WhiteboardStep } from "@/types/whiteboard";

// ── Types ──

type QuestionPhase =
  | "answering"
  | "checking"
  | "correct"
  | "wrong_hint1"
  | "wrong_hint2"
  | "wrong_explained"
  | "whiteboard_breakout";

interface QuizPlayerProps {
  questions: QuizQuestion[];
  sessionId: string | null;
  onComplete: (score: { correct: number; total: number }) => void;
  onRequestMore?: (difficulty: string) => void;
  recordEvent: (type: string, data: Record<string, unknown>) => void;
  // Passed from the hook
  checkAnswer: (
    questionId: string,
    selectedOption: number
  ) => Promise<CheckResult | null>;
  requestWhiteboardExplanation: (
    questionId: string,
    studentOption?: number
  ) => Promise<void>;
  explainSteps: WhiteboardStep[];
  isExplaining: boolean;
}

const OPTION_LABELS = ["A", "B", "C", "D"];

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "text-green-400 bg-green-400/10 border-green-400/30",
  medium: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  hard: "text-red-400 bg-red-400/10 border-red-400/30",
};

export function QuizPlayer({
  questions,
  sessionId,
  onComplete,
  onRequestMore,
  recordEvent,
  checkAnswer,
  requestWhiteboardExplanation,
  explainSteps,
  isExplaining,
}: QuizPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<QuestionPhase>("answering");
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<CheckResult | null>(null);
  const [wrongCount, setWrongCount] = useState(0);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [showDifficulty, setShowDifficulty] = useState(true);
  const advanceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const currentQuestion = questions[currentIndex] || null;
  const isLastQuestion = currentIndex >= questions.length - 1;

  // Whiteboard breakout player
  const {
    currentStepIndex: wbStepIndex,
    stepProgress: wbStepProgress,
    visibleStepIds: wbVisibleIds,
    canAdvance: wbCanAdvance,
    isLastStep: wbIsLastStep,
    advance: wbAdvance,
  } = useStepPlayer(explainSteps, isExplaining);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  const handleSelectOption = useCallback(
    (optionIndex: number) => {
      if (phase !== "answering" || !currentQuestion) return;
      setSelectedOption(optionIndex);
    },
    [phase, currentQuestion]
  );

  const handleSubmit = useCallback(async () => {
    if (selectedOption === null || !currentQuestion) return;

    setPhase("checking");

    recordEvent("quiz_answer_submitted", {
      question_id: currentQuestion.id,
      selected_option: selectedOption,
      question_index: currentIndex,
    });

    const result = await checkAnswer(currentQuestion.id, selectedOption);
    if (!result) {
      setPhase("answering");
      return;
    }

    setLastResult(result);

    if (result.correct) {
      setPhase("correct");
      setScore((prev) => ({
        correct: prev.correct + 1,
        total: prev.total + (wrongCount === 0 ? 1 : 0),
      }));

      recordEvent("quiz_answer_correct", {
        question_id: currentQuestion.id,
        attempts: result.attempts,
      });

      // Auto-advance after 1.2s
      advanceTimerRef.current = setTimeout(() => {
        handleNextQuestion();
      }, 1200);
    } else {
      const newWrongCount = wrongCount + 1;
      setWrongCount(newWrongCount);

      recordEvent("quiz_answer_wrong", {
        question_id: currentQuestion.id,
        attempts: result.attempts,
        wrong_count: newWrongCount,
      });

      if (newWrongCount === 1) {
        setPhase("wrong_hint1");
      } else if (newWrongCount === 2) {
        setPhase("wrong_hint2");
      } else {
        setPhase("wrong_explained");
      }

      // Count first attempt only
      if (newWrongCount === 1) {
        setScore((prev) => ({ ...prev, total: prev.total + 1 }));
      }
    }
  }, [
    selectedOption,
    currentQuestion,
    currentIndex,
    wrongCount,
    checkAnswer,
    recordEvent,
  ]);

  const handleNextQuestion = useCallback(() => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }

    if (isLastQuestion) {
      const finalScore = {
        correct: score.correct + (phase === "correct" ? 0 : 0), // already updated
        total: questions.length,
      };
      onComplete(finalScore);
      return;
    }

    setCurrentIndex((prev) => prev + 1);
    setPhase("answering");
    setSelectedOption(null);
    setLastResult(null);
    setWrongCount(0);
  }, [isLastQuestion, score, questions.length, onComplete, phase]);

  const handleRetry = useCallback(() => {
    setSelectedOption(null);
    setPhase("answering");
  }, []);

  const handleShowWhiteboard = useCallback(() => {
    if (!currentQuestion) return;
    setPhase("whiteboard_breakout");
    recordEvent("quiz_whiteboard_requested", {
      question_id: currentQuestion.id,
    });
    requestWhiteboardExplanation(currentQuestion.id, selectedOption ?? undefined);
  }, [currentQuestion, selectedOption, recordEvent, requestWhiteboardExplanation]);

  const handleExitWhiteboard = useCallback(() => {
    // Return to answering so the student can try again with understanding
    setSelectedOption(null);
    setPhase("answering");
  }, []);

  const handleIDontKnow = useCallback(() => {
    if (!currentQuestion || !lastResult) {
      // First "I don't know" — show hint
      if (currentQuestion) {
        setLastResult({
          correct: false,
          correct_option: currentQuestion.correct_option,
          explanation: currentQuestion.explanation,
          solution_steps: currentQuestion.solution_steps,
          hint: currentQuestion.hint,
          detailed_hint: currentQuestion.detailed_hint,
          attempts: 0,
          verified: currentQuestion.verified,
        });
      }
      setWrongCount((prev) => prev + 1);
      setPhase("wrong_hint1");
      return;
    }

    // Escalate through hint ladder
    if (phase === "wrong_hint1") {
      setPhase("wrong_hint2");
    } else if (phase === "wrong_hint2") {
      setPhase("wrong_explained");
    }
  }, [currentQuestion, lastResult, phase]);

  // ── Whiteboard Breakout ──
  if (phase === "whiteboard_breakout") {
    return (
      <div className="h-full flex flex-col bg-[#0d1117]">
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#30363d] bg-[#161b22]">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#58a6ff]" />
            <span className="text-sm font-medium text-[#f0f6fc]">
              Whiteboard Explanation
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExitWhiteboard}
            className="text-[#8b949e] hover:text-[#f0f6fc] text-xs"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Back to Question
          </Button>
        </div>

        <div className="flex-1 relative min-h-0 overflow-hidden">
          {explainSteps.length === 0 && isExplaining ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-[#58a6ff] animate-spin" />
                <p className="text-sm text-[#8b949e]">
                  Preparing whiteboard explanation...
                </p>
              </div>
            </div>
          ) : (
            <WhiteboardCanvas
              steps={explainSteps}
              currentStepIndex={wbStepIndex}
              stepProgress={wbStepProgress}
              visibleStepIds={wbVisibleIds}
            />
          )}
        </div>

        <div className="shrink-0 px-4 py-2 border-t border-[#30363d] bg-[#161b22] flex items-center justify-between">
          <span className="text-xs text-[#8b949e]">
            {explainSteps.length > 0
              ? `Step ${Math.max(wbStepIndex + 1, 1)} of ${explainSteps.length}`
              : "Loading..."}
            {isExplaining && (
              <span className="text-[#58a6ff] animate-pulse ml-2">
                streaming
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            {wbIsLastStep ? (
              <Button
                onClick={handleExitWhiteboard}
                size="sm"
                className="bg-[#58a6ff] text-white hover:bg-[#4c8ed9]"
              >
                Try the Question Again
              </Button>
            ) : (
              <Button
                onClick={wbAdvance}
                disabled={!wbCanAdvance}
                size="sm"
                className="bg-[#21262d] text-[#f0f6fc] border border-[#30363d] hover:bg-[#30363d] disabled:opacity-40"
              >
                Continue
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── No question loaded ──
  if (!currentQuestion) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0d1117]">
        <p className="text-[#8b949e]">No questions available.</p>
      </div>
    );
  }

  // ── Main Quiz UI ──
  return (
    <div className="h-full flex flex-col bg-[#0d1117]">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#30363d] bg-[#161b22]">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-[#f0f6fc]">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-xs font-medium border",
              DIFFICULTY_COLORS[currentQuestion.difficulty] ||
                DIFFICULTY_COLORS.medium
            )}
          >
            {currentQuestion.difficulty}
          </span>
          {currentQuestion.verified && (
            <span className="text-xs text-green-400/70 flex items-center gap-1">
              <Check className="w-3 h-3" />
              verified
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#8b949e]">
            Score: {score.correct}/{score.total || currentIndex}
          </span>
        </div>
      </div>

      {/* Question + Options */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Question Text */}
          <motion.div
            key={currentQuestion.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-lg text-[#f0f6fc] leading-relaxed"
          >
            <MathContent content={currentQuestion.question_text} />
          </motion.div>

          {/* Options */}
          <div className="space-y-3">
            {currentQuestion.options.map((option, idx) => {
              const isSelected = selectedOption === idx;
              const isCorrectOption =
                lastResult && idx === lastResult.correct_option;
              const isWrongSelected =
                lastResult &&
                !lastResult.correct &&
                isSelected &&
                idx !== lastResult.correct_option;

              const showCorrectHighlight =
                (phase === "correct" ||
                  phase === "wrong_explained") &&
                isCorrectOption;
              const showWrongHighlight =
                (phase === "wrong_hint1" ||
                  phase === "wrong_hint2" ||
                  phase === "wrong_explained") &&
                isWrongSelected;

              return (
                <motion.button
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => handleSelectOption(idx)}
                  disabled={phase !== "answering"}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-xl text-sm transition-all border flex items-start gap-3",
                    showCorrectHighlight
                      ? "border-green-500/50 bg-green-500/10 text-green-300"
                      : showWrongHighlight
                        ? "border-red-500/50 bg-red-500/10 text-red-300"
                        : isSelected
                          ? "border-[#58a6ff] bg-[#58a6ff]/10 text-[#f0f6fc]"
                          : "border-[#30363d] bg-[#161b22] text-[#c9d1d9] hover:border-[#484f58] disabled:hover:border-[#30363d]"
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold",
                      showCorrectHighlight
                        ? "bg-green-500/20 text-green-300"
                        : showWrongHighlight
                          ? "bg-red-500/20 text-red-300"
                          : isSelected
                            ? "bg-[#58a6ff]/20 text-[#58a6ff]"
                            : "bg-[#21262d] text-[#8b949e]"
                    )}
                  >
                    {OPTION_LABELS[idx]}
                  </span>
                  <span className="pt-0.5">
                    <MathContent content={option} />
                  </span>
                  {showCorrectHighlight && (
                    <Check className="w-4 h-4 text-green-400 ml-auto shrink-0 mt-1" />
                  )}
                  {showWrongHighlight && (
                    <X className="w-4 h-4 text-red-400 ml-auto shrink-0 mt-1" />
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* Feedback / Hints */}
          <AnimatePresence mode="wait">
            {phase === "correct" && (
              <motion.div
                key="correct"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-4 rounded-xl border border-green-500/30 bg-green-500/5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="w-5 h-5 text-green-400" />
                  <span className="text-sm font-semibold text-green-300">
                    Correct!
                  </span>
                </div>
                <div className="text-sm text-[#c9d1d9]">
                  <MathContent content={lastResult?.explanation || ""} />
                </div>
              </motion.div>
            )}

            {phase === "wrong_hint1" && lastResult && (
              <motion.div
                key="hint1"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-5 h-5 text-yellow-400" />
                  <span className="text-sm font-semibold text-yellow-300">
                    Not quite. Here is a hint:
                  </span>
                </div>
                <div className="text-sm text-[#c9d1d9]">
                  <MathContent content={lastResult.hint || "Think about the approach carefully."} />
                </div>
              </motion.div>
            )}

            {phase === "wrong_hint2" && lastResult && (
              <motion.div
                key="hint2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-4 rounded-xl border border-orange-500/30 bg-orange-500/5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-5 h-5 text-orange-400" />
                  <span className="text-sm font-semibold text-orange-300">
                    Detailed hint:
                  </span>
                </div>
                <div className="text-sm text-[#c9d1d9]">
                  <MathContent content={lastResult.detailed_hint || lastResult.hint || ""} />
                </div>
              </motion.div>
            )}

            {phase === "wrong_explained" && lastResult && (
              <motion.div
                key="explained"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="p-4 rounded-xl border border-[#58a6ff]/30 bg-[#58a6ff]/5">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="w-5 h-5 text-[#58a6ff]" />
                    <span className="text-sm font-semibold text-[#58a6ff]">
                      Full Explanation
                    </span>
                  </div>
                  <div className="text-sm text-[#c9d1d9] mb-3">
                    <MathContent content={lastResult.explanation} />
                  </div>
                  {lastResult.solution_steps &&
                    lastResult.solution_steps.length > 0 && (
                      <div className="space-y-2 mt-3 pt-3 border-t border-[#30363d]">
                        <p className="text-xs font-medium text-[#8b949e] uppercase tracking-wide">
                          Solution Steps
                        </p>
                        {lastResult.solution_steps.map((step, i) => (
                          <div key={i} className="flex gap-2 text-sm">
                            <span className="shrink-0 text-[#58a6ff] font-mono text-xs mt-0.5">
                              {i + 1}.
                            </span>
                            <div className="text-[#c9d1d9]">
                              <MathContent
                                content={`${step.description || step.step}${step.math ? ` $${step.math}$` : ""}`}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="shrink-0 px-4 py-3 border-t border-[#30363d] bg-[#161b22] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* I don't know / hint escalation */}
          {(phase === "answering" ||
            phase === "wrong_hint1" ||
            phase === "wrong_hint2") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleIDontKnow}
              className="text-[#8b949e] hover:text-[#f0f6fc] text-xs"
            >
              <Lightbulb className="w-3.5 h-3.5 mr-1" />
              {phase === "answering"
                ? "I need a hint"
                : phase === "wrong_hint1"
                  ? "More help"
                  : "Show full solution"}
            </Button>
          )}

          {/* Whiteboard breakout */}
          {(phase === "wrong_hint1" ||
            phase === "wrong_hint2" ||
            phase === "wrong_explained") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleShowWhiteboard}
              className="text-[#58a6ff] hover:text-[#79c0ff] text-xs"
            >
              <BookOpen className="w-3.5 h-3.5 mr-1" />
              Show me on the whiteboard
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Retry (when wrong, before full explanation) */}
          {(phase === "wrong_hint1" || phase === "wrong_hint2") && (
            <Button
              onClick={handleRetry}
              size="sm"
              className="bg-[#21262d] text-[#f0f6fc] border border-[#30363d] hover:bg-[#30363d]"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Try Again
            </Button>
          )}

          {/* Submit */}
          {phase === "answering" && selectedOption !== null && (
            <Button
              onClick={handleSubmit}
              size="sm"
              className="bg-[#58a6ff] text-white hover:bg-[#4c8ed9]"
            >
              <Check className="w-3.5 h-3.5 mr-1.5" />
              Submit
            </Button>
          )}

          {/* Checking spinner */}
          {phase === "checking" && (
            <Button size="sm" disabled className="bg-[#21262d] text-[#8b949e]">
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Checking...
            </Button>
          )}

          {/* Next question (after explained or correct with manual advance) */}
          {(phase === "wrong_explained" || phase === "correct") && (
            <Button
              onClick={handleNextQuestion}
              size="sm"
              className={cn(
                phase === "correct"
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : "bg-[#58a6ff] text-white hover:bg-[#4c8ed9]"
              )}
            >
              {isLastQuestion ? (
                <>
                  <Trophy className="w-3.5 h-3.5 mr-1.5" />
                  Finish Quiz
                </>
              ) : (
                <>
                  Next Question
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
