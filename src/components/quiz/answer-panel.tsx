"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MathContent } from "./math-content";
import type { Problem } from "./types";

export type FeedbackState = {
  type: "correct" | "wrong";
  correctOption: number;
};

type AnswerPanelProps = {
  problem: Problem;
  questionNumber: number;
  selectedOption: number | undefined;
  isMarked: boolean;
  onSelect: (optionIndex: number) => void;
  onToggleMark: () => void;
  direction: number; // 1 = forward, -1 = backward
  /** After server validates, highlight correct (green) and wrong-selected (red) */
  feedbackState?: FeedbackState;
  /** Prevent re-answering after validation */
  disabled?: boolean;
  /** Hide "Mark for Review" button (default true) */
  showMark?: boolean;
  /** Extra content rendered below the options (e.g. explanation panel) */
  children?: React.ReactNode;
};

export function AnswerPanel({
  problem,
  questionNumber,
  selectedOption,
  isMarked,
  onSelect,
  onToggleMark,
  direction,
  feedbackState,
  disabled,
  showMark = true,
  children,
}: AnswerPanelProps) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-lg font-bold">{questionNumber}</span>
        {showMark && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleMark}
            className={cn(isMarked && "text-athena-amber")}
          >
            <Bookmark
              className={cn("mr-1 h-4 w-4", isMarked && "fill-athena-amber")}
            />
            Mark for Review
          </Button>
        )}
      </div>

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={problem.id}
          custom={direction}
          initial={{ opacity: 0, x: direction * 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -20 }}
          transition={{ duration: 0.2 }}
          className="space-y-3"
        >
          {problem.options.map((option, i) => {
            const letter = String.fromCharCode(65 + i);
            const isSelected = selectedOption === i;

            // Feedback styling when server has validated
            const isCorrectFeedback = feedbackState && feedbackState.type === "correct" && i === feedbackState.correctOption;
            const isWrongFeedback =
              feedbackState &&
              feedbackState.type === "wrong" &&
              isSelected;

            return (
              <motion.button
                key={i}
                whileTap={!disabled ? { scale: 0.98 } : undefined}
                onClick={() => !disabled && onSelect(i)}
                disabled={disabled}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                  // Default states (no feedback)
                  !feedbackState && isSelected
                    ? "border-primary bg-primary/10"
                    : !feedbackState && !disabled
                      ? "hover:border-primary/50 hover:bg-accent/50"
                      : "",
                  // Feedback states
                  isCorrectFeedback && "border-athena-success bg-athena-success/10",
                  isWrongFeedback && "border-destructive bg-destructive/10",
                  // Dim non-relevant options after feedback
                  feedbackState && !isCorrectFeedback && !isWrongFeedback && "opacity-50",
                  disabled && "cursor-default"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                    !feedbackState && isSelected && "border-primary bg-primary text-primary-foreground",
                    isCorrectFeedback && "border-athena-success bg-athena-success text-white",
                    isWrongFeedback && "border-destructive bg-destructive text-white"
                  )}
                >
                  {letter}
                </span>
                <span className="pt-0.5"><MathContent content={option} /></span>
              </motion.button>
            );
          })}
        </motion.div>
      </AnimatePresence>

      {children}
    </div>
  );
}
