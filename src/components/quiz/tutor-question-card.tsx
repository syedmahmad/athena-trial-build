"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MathContent } from "@/components/quiz/math-content";
import type { Problem } from "@/components/quiz/types";
import type { FeedbackState } from "@/components/quiz/answer-panel";

type TutorQuestionCardProps = {
  problem: Problem;
  questionNumber: number;
  selectedOption?: number;
  feedbackState?: FeedbackState;
  onSelect: (optionIndex: number) => void;
};

const OPTION_LABELS = ["A", "B", "C", "D"];

export function TutorQuestionCard({
  problem,
  questionNumber,
  selectedOption,
  feedbackState,
  onSelect,
}: TutorQuestionCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ type: "spring", stiffness: 400, damping: 30, delay: 0.1 }}
      className="fixed top-20 left-6 z-[61]"
    >
      <AnimatePresence initial={false} mode="wait">
        {collapsed ? (
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            onClick={() => setCollapsed(false)}
            className="flex items-center justify-center h-10 w-10 rounded-full bg-primary text-primary-foreground text-sm font-bold shadow-lg hover:scale-105 active:scale-95 transition-transform cursor-pointer"
          >
            {questionNumber}
          </motion.button>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="w-[320px]"
          >
            <div className="rounded-xl bg-card/95 backdrop-blur-sm shadow-lg border overflow-hidden max-h-[calc(100vh-200px)] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    {questionNumber}
                  </span>
                  Question {questionNumber}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setCollapsed(true)}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
              </div>

              {/* Question text */}
              <div className="px-4 pb-3">
                <MathContent content={problem.questionText} />
              </div>

              {/* Answer options */}
              <div className="px-3 pb-3 space-y-1.5">
                {problem.options.map((option, i) => {
                  const isSelected = selectedOption === i;
                  const isCorrect = feedbackState?.type === "correct" && isSelected;
                  const isWrong = feedbackState?.type === "wrong" && isSelected;

                  let ringClass = isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/60";
                  if (isCorrect) ringClass = "bg-green-500/10 ring-1 ring-green-500/40";
                  else if (isWrong) ringClass = "bg-destructive/10 ring-1 ring-destructive/30";

                  let labelClass = isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground";
                  if (isCorrect) labelClass = "bg-green-500 text-white";
                  else if (isWrong) labelClass = "bg-destructive text-white";

                  return (
                    <button
                      key={i}
                      onClick={() => onSelect(i)}
                      disabled={!!feedbackState}
                      className={`w-full flex items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed ${ringClass}`}
                    >
                      <span
                        className={`flex items-center justify-center h-5 w-5 rounded-full text-xs font-medium shrink-0 mt-0.5 ${labelClass}`}
                      >
                        {OPTION_LABELS[i]}
                      </span>
                      <span className="flex-1 leading-relaxed">
                        <MathContent content={option} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
