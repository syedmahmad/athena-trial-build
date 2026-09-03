"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Maximize2 } from "lucide-react";
import type { WhiteboardStep } from "@/types/whiteboard";
import { useWhiteboardPlayer } from "@/hooks/use-whiteboard-player";
import { WhiteboardCanvas } from "./whiteboard-canvas";
import { WhiteboardPanel } from "./whiteboard-panel";

type InlineWhiteboardProps = {
  steps: WhiteboardStep[];
  isStreaming: boolean;
};

export function InlineWhiteboard({ steps, isStreaming }: InlineWhiteboardProps) {
  const [expanded, setExpanded] = useState(false);

  const {
    currentStepIndex,
    stepProgress,
    visibleStepIds,
  } = useWhiteboardPlayer(steps, isStreaming);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="relative flex-1 min-w-0 max-w-[50%] rounded-lg border bg-card overflow-hidden group cursor-pointer"
        onClick={() => setExpanded(true)}
      >
        {/* Compact canvas */}
        <div className="aspect-[5/3]">
          <WhiteboardCanvas
            steps={steps}
            visibleStepIds={visibleStepIds}
            currentStepIndex={currentStepIndex}
            stepProgress={stepProgress}
          />
        </div>

        {/* Expand hint */}
        <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="rounded-md bg-background/80 backdrop-blur-sm p-1">
            <Maximize2 className="h-3 w-3 text-muted-foreground" />
          </div>
        </div>

        {/* Live indicator */}
        {isStreaming && (
          <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-background/80 backdrop-blur-sm px-2 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] text-muted-foreground">Live</span>
          </div>
        )}
      </motion.div>

      {/* Full-screen expanded view */}
      <WhiteboardPanel
        steps={steps}
        isStreaming={isStreaming}
        open={expanded}
        onClose={() => setExpanded(false)}
      />
    </>
  );
}
