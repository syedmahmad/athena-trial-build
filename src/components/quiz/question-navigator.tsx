"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { QuestionStatus } from "./types";

type QuestionNavigatorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  currentIndex: number;
  getStatus: (index: number) => QuestionStatus;
  onNavigate: (index: number) => void;
};

const statusColors: Record<QuestionStatus, string> = {
  unanswered: "bg-muted text-muted-foreground",
  answered: "bg-primary text-primary-foreground",
  marked: "bg-athena-amber text-foreground",
};

export function QuestionNavigator({
  open,
  onOpenChange,
  total,
  currentIndex,
  getStatus,
  onNavigate,
}: QuestionNavigatorProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Question Navigator</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: total }, (_, i) => {
            const status = getStatus(i);
            return (
              <button
                key={i}
                onClick={() => onNavigate(i)}
                className={cn(
                  "flex h-10 w-full items-center justify-center rounded-md text-sm font-medium transition-colors",
                  statusColors[status],
                  i === currentIndex && "ring-2 ring-ring ring-offset-1 ring-offset-background"
                )}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded bg-muted" />
            Unanswered
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded bg-primary" />
            Answered
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded bg-athena-amber" />
            Marked
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
