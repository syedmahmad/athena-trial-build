"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MathContent } from "./math-content";
import type { Problem } from "./types";

type QuestionPanelProps = {
  problem: Problem;
  questionNumber: number;
  /** When true, hint button appears and hint is auto-opened */
  hintRevealed?: boolean;
};

export function QuestionPanel({ problem, questionNumber, hintRevealed = false }: QuestionPanelProps) {
  const [hintOpen, setHintOpen] = useState(false);

  useEffect(() => {
    if (hintRevealed) setHintOpen(true);
  }, [hintRevealed]);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-4">
        <span className="text-sm font-medium text-muted-foreground">
          Question {questionNumber}
        </span>
      </div>

      <MathContent content={problem.questionText} />

      {problem.hint && hintRevealed && (
        <div className="mt-6">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setHintOpen((h) => !h)}
          >
            <Lightbulb className="mr-1 h-4 w-4" />
            Need a hint?
            {hintOpen ? (
              <ChevronUp className="ml-1 h-3 w-3" />
            ) : (
              <ChevronDown className="ml-1 h-3 w-3" />
            )}
          </Button>
          {hintOpen && (
            <div className="mt-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <MathContent content={problem.hint} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
