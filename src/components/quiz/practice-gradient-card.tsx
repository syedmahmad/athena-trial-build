"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MathContent } from "./math-content";
import { useSound } from "@/hooks/useSound";
import type { Problem } from "./types";

type PracticeGradientCardProps = {
  problem: Problem;
  questionNumber: number;
  /** Called when the student answers correctly. */
  onCorrect: () => void;
  /** Called after the answer is revealed (all attempts exhausted). */
  onExhausted: () => void;
  /** When set, the parent surfaces hint / detailedHint elsewhere
   *  (e.g. as canvas callouts in micro-lesson practice). The card
   *  suppresses its own inline hint blocks and forwards phase
   *  transitions to the parent so the parent can render them. */
  onHintPhaseChange?: (phase: "answering" | "hinted" | "detailed" | "revealed") => void;
  /** Fires on each wrong selection (before the reveal). The parent can
   *  use this to play a retry-encouragement narration. */
  onWrong?: () => void;
};

type Phase = "answering" | "hinted" | "detailed" | "revealed";

export function PracticeGradientCard({
  problem,
  questionNumber,
  onCorrect,
  onExhausted,
  onHintPhaseChange,
  onWrong,
}: PracticeGradientCardProps) {
  const [phase, setPhase] = useState<Phase>("answering");
  const suppressInlineHints = !!onHintPhaseChange;
  const onHintPhaseChangeRef = useRef(onHintPhaseChange);
  onHintPhaseChangeRef.current = onHintPhaseChange;
  useEffect(() => {
    onHintPhaseChangeRef.current?.(phase);
  }, [phase]);
  const [selected, setSelected] = useState<number | null>(null);
  const [wrongIndices, setWrongIndices] = useState<Set<number>>(new Set());
  const calledRef = useRef(false);
  const sound = useSound();

  const isCorrect = selected === problem.correctOption;
  const isRevealed = phase === "revealed";

  // Auto-advance after reveal
  useEffect(() => {
    if (!isRevealed || calledRef.current) return;
    calledRef.current = true;
    const delay = isCorrect ? 1000 : 2500;
    const t = setTimeout(() => {
      if (isCorrect) onCorrect();
      else onExhausted();
    }, delay);
    return () => clearTimeout(t);
  }, [isRevealed, isCorrect, onCorrect, onExhausted]);

  const handleSelect = useCallback(
    (index: number) => {
      if (isRevealed || wrongIndices.has(index)) return;

      setSelected(index);

      if (index === problem.correctOption) {
        sound.achievement();
        setPhase("revealed");
        return;
      }

      // Wrong — progressive gradient
      sound.wrong();
      const next = new Set(wrongIndices);
      next.add(index);
      setWrongIndices(next);
      onWrong?.();

      if (phase === "answering" && problem.hint) {
        setPhase("hinted");
      } else if (phase === "hinted" && problem.detailedHint) {
        setPhase("detailed");
      } else {
        // No more hints — reveal
        setPhase("revealed");
      }
    },
    [isRevealed, wrongIndices, problem, phase, sound, onWrong]
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Question number + text */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">
          Question {questionNumber}
        </span>
        <div className="text-sm font-medium">
          <MathContent content={problem.questionText} />
        </div>
      </div>

      {/* Options */}
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {problem.options.map((option, i) => {
          const isThis = selected === i;
          const isRight = i === problem.correctOption;
          const isWrong = wrongIndices.has(i);

          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={isRevealed || isWrong}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                !isRevealed && !isWrong && "hover:bg-muted cursor-pointer",
                isRevealed && isRight && "border-green-500 bg-green-500/10",
                isRevealed && isThis && !isRight && "border-red-500 bg-red-500/10",
                isRevealed && !isThis && !isRight && "opacity-50",
                isWrong && !isRevealed && "border-red-500/50 bg-red-500/5 opacity-60",
              )}
              style={
                isRevealed && isRight
                  ? { boxShadow: "0 0 12px rgba(34, 197, 94, 0.3)" }
                  : undefined
              }
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-medium mt-0.5",
                  isRevealed && isRight && "border-green-500 bg-green-500 text-white",
                  ((isRevealed && isThis && !isRight) || isWrong) &&
                    "border-red-500 bg-red-500 text-white",
                )}
              >
                {isRevealed && isRight ? (
                  <Check className="h-3 w-3" />
                ) : (isRevealed && isThis && !isRight) || isWrong ? (
                  <X className="h-3 w-3" />
                ) : (
                  String.fromCharCode(65 + i)
                )}
              </span>
              <span className="flex-1 leading-relaxed">
                <MathContent content={option} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Nudge hint (amber) */}
      {!suppressInlineHints && (phase === "hinted" || phase === "detailed") && problem.hint && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-0.5">
            Think about it:
          </p>
          <p className="text-sm text-muted-foreground">
            <MathContent content={problem.hint} />
          </p>
        </motion.div>
      )}

      {/* Detailed hint (blue) */}
      {!suppressInlineHints && phase === "detailed" && problem.detailedHint && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-0.5">
            Let me walk you through it:
          </p>
          <p className="text-sm text-muted-foreground">
            <MathContent content={problem.detailedHint} />
          </p>
        </motion.div>
      )}

      {/* Revealed state — explanation */}
      {isRevealed && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="space-y-1.5"
        >
          {isCorrect && (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
              className="flex items-center gap-1.5 text-green-500"
            >
              <Check className="h-4 w-4" />
              <span className="text-sm font-bold">Correct!</span>
            </motion.div>
          )}
          <div className="text-xs text-muted-foreground">
            <MathContent content={problem.explanation} />
          </div>
          {!isCorrect && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-xs"
              onClick={onExhausted}
            >
              Got it, continue
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </motion.div>
      )}
    </div>
  );
}
