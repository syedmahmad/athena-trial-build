"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { MathContent } from "./math-content";
import type { Problem } from "./types";

const difficultyColor: Record<string, string> = {
  easy: "bg-athena-success/10 text-athena-success",
  medium: "bg-athena-amber/10 text-athena-amber",
  hard: "bg-destructive/10 text-destructive",
};

type ReviewItemProps = {
  problem: Problem;
  index: number;
  selectedOption: number | undefined;
};

export function ReviewItem({ problem, index, selectedOption }: ReviewItemProps) {
  const isCorrect = selectedOption === problem.correctOption;
  const wasAnswered = selectedOption !== undefined;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold">Q{index + 1}</span>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
            difficultyColor[problem.difficulty] ?? "bg-muted text-muted-foreground"
          )}
        >
          {problem.difficulty}
        </span>
        {wasAnswered ? (
          isCorrect ? (
            <CheckCircle2 className="ml-auto h-5 w-5 text-athena-success" />
          ) : (
            <XCircle className="ml-auto h-5 w-5 text-destructive" />
          )
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">
            Not answered
          </span>
        )}
      </div>

      <MathContent content={problem.questionText} />

      <div className="space-y-1.5">
        {problem.options.map((option, i) => {
          const letter = String.fromCharCode(65 + i);
          const isThisCorrect = i === problem.correctOption;
          const isThisSelected = i === selectedOption;
          return (
            <div
              key={i}
              className={cn(
                "flex items-start gap-2 rounded-md px-3 py-2 text-sm",
                isThisCorrect && "bg-athena-success/10",
                isThisSelected && !isThisCorrect && "bg-destructive/10"
              )}
            >
              {isThisCorrect && (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-athena-success" />
              )}
              {isThisSelected && !isThisCorrect && (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              )}
              {!isThisCorrect && !isThisSelected && (
                <span className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span className="flex items-baseline gap-1">
                <span className="font-medium">{letter}.</span> <MathContent content={option} />
              </span>
            </div>
          );
        })}
      </div>

      <div className="rounded-md bg-muted p-3 space-y-2">
        <p className="text-sm font-medium">Explanation</p>
        <MathContent content={problem.explanation} />
      </div>

      {problem.solutionSteps.length > 0 && (
        <div className="rounded-md bg-muted p-3">
          <p className="text-sm font-medium mb-2">Solution Steps</p>
          <ol className="space-y-1.5">
            {problem.solutionSteps.map((step) => (
              <li key={step.step} className="text-sm text-muted-foreground">
                <span className="font-medium">{step.step}.</span>{" "}
                {step.instruction}
                {step.math && <MathContent content={step.math} />}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
