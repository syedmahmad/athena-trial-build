"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

const steps = [
  { id: "quiz", label: "Level Quiz" },
  { id: "schedule", label: "Schedule" },
  { id: "completed", label: "Ready!" },
] as const;

type Step = (typeof steps)[number]["id"];

const stepOrder: Step[] = ["quiz", "schedule", "completed"];

export function ProgressStepper({ currentStep }: { currentStep: Step }) {
  const currentIndex = stepOrder.indexOf(currentStep);

  return (
    <div className="flex items-center justify-center gap-2">
      {steps.map((step, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;

        return (
          <div key={step.id} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={cn(
                  "h-px w-8 sm:w-12",
                  isCompleted ? "bg-athena-success" : "bg-border"
                )}
              />
            )}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                  isCompleted &&
                    "bg-athena-success text-white",
                  isCurrent &&
                    "bg-primary text-primary-foreground",
                  !isCompleted &&
                    !isCurrent &&
                    "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={cn(
                  "hidden text-sm font-medium sm:inline",
                  isCurrent
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
