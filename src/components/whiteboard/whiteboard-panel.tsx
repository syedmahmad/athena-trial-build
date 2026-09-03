"use client";

import { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import type { WhiteboardStep } from "@/types/whiteboard";
import { useWhiteboardPlayer } from "@/hooks/use-whiteboard-player";
import { WhiteboardToolbar } from "./whiteboard-toolbar";
import { WhiteboardCanvas } from "./whiteboard-canvas";
import { WhiteboardTimeline } from "./whiteboard-timeline";

type WhiteboardPanelProps = {
  steps: WhiteboardStep[];
  isStreaming: boolean;
  open: boolean;
  onClose: () => void;
};

export function WhiteboardPanel({ steps, isStreaming, open, onClose }: WhiteboardPanelProps) {
  const {
    state,
    currentStepIndex,
    stepProgress,
    visibleStepIds,
    speed,
    totalSteps,
    play,
    pause,
    replay,
    seekToStep,
    changeSpeed,
  } = useWhiteboardPlayer(open ? steps : [], open ? isStreaming : false);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          if (state === "playing") pause();
          else play();
          break;
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (currentStepIndex > 0) seekToStep(currentStepIndex - 1);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (currentStepIndex < totalSteps - 1) seekToStep(currentStepIndex + 1);
          break;
      }
    },
    [open, state, currentStepIndex, totalSteps, play, pause, seekToStep, onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  if (typeof window === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md"
        >
          <WhiteboardToolbar
            state={state}
            speed={speed}
            currentStep={currentStepIndex}
            totalSteps={totalSteps}
            isStreaming={isStreaming}
            onPlay={play}
            onPause={pause}
            onReplay={replay}
            onSpeedChange={changeSpeed}
            onClose={onClose}
          />

          <div className="flex-1 overflow-hidden p-4">
            <div className="mx-auto h-full max-w-5xl rounded-lg border shadow-sm overflow-hidden">
              <WhiteboardCanvas
                steps={steps}
                visibleStepIds={visibleStepIds}
                currentStepIndex={currentStepIndex}
                stepProgress={stepProgress}
              />
            </div>
          </div>

          <WhiteboardTimeline
            totalSteps={totalSteps}
            currentStep={currentStepIndex}
            visibleStepIds={visibleStepIds}
            stepIds={steps.map((s) => s.id)}
            onSeek={seekToStep}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
