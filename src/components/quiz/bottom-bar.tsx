"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { QuestionNavigator } from "./question-navigator";
import type { QuestionStatus } from "./types";

type BottomBarProps = {
  currentIndex: number;
  total: number;
  unansweredCount: number;
  onBack: () => void;
  onNext: () => void;
  onGoTo: (index: number) => void;
  onSubmit: () => void;
  getStatus: (index: number) => QuestionStatus;
  /** Sequential mode: disable Back always, hide question navigator, show Next only after answer */
  sequential?: boolean;
  /** Externally control whether Next is disabled */
  nextDisabled?: boolean;
  /** Called on last question instead of onSubmit for onboarding completion flow */
  onFinish?: () => void;
};

export function BottomBar({
  currentIndex,
  total,
  unansweredCount,
  onBack,
  onNext,
  onGoTo,
  onSubmit,
  getStatus,
  sequential = false,
  nextDisabled,
  onFinish,
}: BottomBarProps) {
  const [navOpen, setNavOpen] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const isLast = currentIndex === total - 1;

  const handleSubmitClick = () => {
    if (onFinish) {
      onFinish();
    } else {
      setConfirmSubmit(true);
    }
  };

  const handleNavJump = (index: number) => {
    onGoTo(index);
    setNavOpen(false);
  };

  return (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between border-t bg-card px-4">
        <div />
        {!sequential ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNavOpen(true)}
            className="font-medium"
          >
            Question {currentIndex + 1} of {total}
            <ChevronDown className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <span className="text-sm font-medium text-muted-foreground">
            Question {currentIndex + 1} of {total}
          </span>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            disabled={sequential || currentIndex === 0}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          {isLast ? (
            <Button
              size="sm"
              onClick={handleSubmitClick}
              disabled={nextDisabled}
            >
              {onFinish ? "Finish" : "Submit"}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onNext}
              disabled={nextDisabled}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {!sequential && (
        <QuestionNavigator
          open={navOpen}
          onOpenChange={setNavOpen}
          total={total}
          currentIndex={currentIndex}
          getStatus={getStatus}
          onNavigate={handleNavJump}
        />
      )}

      {!onFinish && (
        <Dialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit Quiz?</DialogTitle>
              <DialogDescription>
                {unansweredCount > 0
                  ? `You have ${unansweredCount} unanswered question${unansweredCount > 1 ? "s" : ""}. Are you sure you want to submit?`
                  : "Are you sure you want to submit your answers?"}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmSubmit(false)}
              >
                Review Answers
              </Button>
              <Button
                onClick={() => {
                  setConfirmSubmit(false);
                  onSubmit();
                }}
              >
                Submit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
