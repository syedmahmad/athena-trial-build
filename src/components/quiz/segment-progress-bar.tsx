"use client";

import { cn } from "@/lib/utils";
import type { QuestionStatus } from "./types";

type SegmentProgressBarProps = {
  total: number;
  currentIndex: number;
  getStatus: (index: number) => QuestionStatus;
  onNavigate: (index: number) => void;
};

const statusColors: Record<QuestionStatus, string> = {
  unanswered: "bg-muted",
  answered: "bg-primary",
  marked: "bg-athena-amber",
};

export function SegmentProgressBar({
  total,
  currentIndex,
  getStatus,
  onNavigate,
}: SegmentProgressBarProps) {
  return (
    <div className="flex gap-1 px-4 py-2 border-b bg-card">
      {Array.from({ length: total }, (_, i) => {
        const status = getStatus(i);
        return (
          <button
            key={i}
            onClick={() => onNavigate(i)}
            className={cn(
              "h-2 flex-1 rounded-full transition-all",
              statusColors[status],
              i === currentIndex && "ring-2 ring-ring ring-offset-1 ring-offset-background"
            )}
            aria-label={`Question ${i + 1}: ${status}`}
          />
        );
      })}
    </div>
  );
}
