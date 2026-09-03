"use client";

import { motion } from "framer-motion";

type WhiteboardTimelineProps = {
  totalSteps: number;
  currentStep: number;
  visibleStepIds: Set<number>;
  stepIds: number[];
  onSeek: (stepIndex: number) => void;
};

export function WhiteboardTimeline({
  totalSteps,
  currentStep,
  visibleStepIds,
  stepIds,
  onSeek,
}: WhiteboardTimelineProps) {
  if (totalSteps === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-t bg-card/80 backdrop-blur-sm">
      {stepIds.map((id, idx) => {
        const isComplete = visibleStepIds.has(id) && idx < currentStep;
        const isCurrent = idx === currentStep;

        return (
          <button
            key={id}
            onClick={() => onSeek(idx)}
            className="relative flex items-center justify-center"
            style={{ flex: 1, maxWidth: 40 }}
          >
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{
                  backgroundColor: isCurrent
                    ? "hsl(var(--primary))"
                    : isComplete
                      ? "hsl(var(--primary) / 0.6)"
                      : "transparent",
                }}
                initial={false}
                animate={{
                  width: isCurrent || isComplete ? "100%" : "0%",
                }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
