"use client";

import { useState } from "react";
import { Calculator, X, Eye, EyeOff, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ToolbarProps = {
  displayTime: string;
  isLow: boolean;
  timerHidden: boolean;
  onToggleTimer: () => void;
  calcOpen: boolean;
  onToggleCalc: () => void;
  onClose: () => void;
  hasAnswers: boolean;
  subtopicName: string;
  /** Hide entire timer section (default true) */
  showTimer?: boolean;
  /** Hide calculator button (default true) */
  showCalc?: boolean;
  /** Override the subtitle displayed next to Directions */
  title?: string;
  /** Optional skip action — renders a "Skip" button next to the calculator */
  onSkip?: () => void;
  /** Label for the skip button */
  skipLabel?: string;
};

export function Toolbar({
  displayTime,
  isLow,
  timerHidden,
  onToggleTimer,
  calcOpen,
  onToggleCalc,
  onClose,
  hasAnswers,
  subtopicName,
  showTimer = true,
  showCalc = true,
  title,
  onSkip,
  skipLabel = "Skip",
}: ToolbarProps) {
  const [showDirections, setShowDirections] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  const handleClose = () => {
    if (hasAnswers) {
      setConfirmExit(true);
    } else {
      onClose();
    }
  };

  return (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDirections((d) => !d)}
          >
            <BookOpen className="mr-1 h-4 w-4" />
            Directions
          </Button>
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {title ?? subtopicName}
          </span>
        </div>

        {showTimer && (
          <div className="flex items-center gap-2">
            {!timerHidden && (
              <span
                className={cn(
                  "font-mono text-lg font-semibold tabular-nums",
                  isLow && "text-destructive animate-pulse"
                )}
              >
                {displayTime}
              </span>
            )}
            <Button variant="ghost" size="icon" onClick={onToggleTimer}>
              {timerHidden ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}

        <div className="flex items-center gap-1">
          {onSkip && (
            <Button variant="outline" size="sm" onClick={onSkip} className="mr-1 text-xs">
              {skipLabel}
            </Button>
          )}
          {showCalc && (
            <Button
              variant={calcOpen ? "secondary" : "ghost"}
              size="icon"
              onClick={onToggleCalc}
            >
              <Calculator className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showDirections && (
        <div className="border-b bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">Directions</p>
          <p>
            Answer each question by selecting the best answer from the choices
            provided. You can navigate freely between questions using the Back
            and Next buttons or the question navigator. Mark questions for
            review if you want to revisit them. When you are finished, click
            Submit to see your results.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setShowDirections(false)}
          >
            Close Directions
          </Button>
        </div>
      )}

      <Dialog open={confirmExit} onOpenChange={setConfirmExit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exit Quiz?</DialogTitle>
            <DialogDescription>
              You have unsaved answers. Your progress will be lost if you exit
              now.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmExit(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onClose}>
              Exit Quiz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
