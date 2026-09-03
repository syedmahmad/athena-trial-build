"use client";

import { Play, Pause, RotateCcw, X, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlayerState, PlaybackSpeed } from "@/hooks/use-whiteboard-player";

const SPEEDS: PlaybackSpeed[] = [0.5, 1, 1.5, 2];

type WhiteboardToolbarProps = {
  state: PlayerState;
  speed: PlaybackSpeed;
  currentStep: number;
  totalSteps: number;
  isStreaming?: boolean;
  narrationEnabled?: boolean;
  isNarrating?: boolean;
  onToggleNarration?: () => void;
  onPlay: () => void;
  onPause: () => void;
  onReplay: () => void;
  onSpeedChange: (speed: PlaybackSpeed) => void;
  onClose?: () => void;
};

export function WhiteboardToolbar({
  state,
  speed,
  currentStep,
  totalSteps,
  isStreaming,
  narrationEnabled,
  isNarrating,
  onToggleNarration,
  onPlay,
  onPause,
  onReplay,
  onSpeedChange,
  onClose,
}: WhiteboardToolbarProps) {
  const nextSpeed = () => {
    const idx = SPEEDS.indexOf(speed);
    onSpeedChange(SPEEDS[(idx + 1) % SPEEDS.length]);
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b bg-card/80 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        {/* Play/Pause */}
        {state === "playing" ? (
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onPause}>
            <Pause className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onPlay}>
            <Play className="h-4 w-4" />
          </Button>
        )}

        {/* Replay */}
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onReplay}>
          <RotateCcw className="h-4 w-4" />
        </Button>

        {/* Speed */}
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2 text-xs font-mono min-w-[48px]"
          onClick={nextSpeed}
        >
          {speed}x
        </Button>

        {/* Narration toggle */}
        {onToggleNarration && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={onToggleNarration}
            title="Toggle voice narration"
          >
            {narrationEnabled ? (
              <Volume2 className={`h-4 w-4 ${isNarrating ? "animate-pulse" : ""}`} />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </Button>
        )}

        {/* Step counter */}
        <span className="text-xs text-muted-foreground ml-2">
          Step {Math.max(0, currentStep + 1)} of {totalSteps}
          {isStreaming && (
            <span className="inline-flex items-center gap-1 ml-2 text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Live
            </span>
          )}
        </span>
      </div>

      {onClose && (
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
