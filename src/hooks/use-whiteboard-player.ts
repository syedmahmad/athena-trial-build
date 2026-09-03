"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { WhiteboardStep } from "@/types/whiteboard";

export type PlayerState = "idle" | "playing" | "paused" | "complete";
export type PlaybackSpeed = 0.5 | 1 | 1.5 | 2;

type StepTimeline = {
  step: WhiteboardStep;
  startMs: number;
  endMs: number;
};

/**
 * Whiteboard player for a persistent board.
 *
 * Steps accumulate across the conversation. When new steps arrive (from a new
 * tutor message), only the NEW steps animate — previously completed steps
 * remain visible on the board.
 */
export function useWhiteboardPlayer(
  steps: WhiteboardStep[],
  isStreaming: boolean,
) {
  const [state, setState] = useState<PlayerState>("idle");
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [stepProgress, setStepProgress] = useState(0);
  const [visibleStepIds, setVisibleStepIds] = useState<Set<number>>(new Set());
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);

  const timelineRef = useRef<StepTimeline[]>([]);
  const startTimeRef = useRef(0);
  const pausedAtRef = useRef(0);
  const rafRef = useRef(0);
  const speedRef = useRef<PlaybackSpeed>(1);
  // Track how many steps we've already "committed" (fully played from prev messages)
  const committedCountRef = useRef(0);
  const prevStepCountRef = useRef(0);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  speedRef.current = speed;

  // Build timeline for only the NEW steps (after committed ones)
  useEffect(() => {
    const newSteps = steps.slice(committedCountRef.current);
    let cumulative = 0;
    timelineRef.current = newSteps.map((step) => {
      const startMs = cumulative + step.delayMs;
      const endMs = startMs + step.durationMs;
      cumulative = endMs;
      return { step, startMs, endMs };
    });
  }, [steps]);

  const tick = useCallback(() => {
    const elapsed = (performance.now() - startTimeRef.current) * speedRef.current;
    const tl = timelineRef.current;
    const total = tl.length > 0 ? tl[tl.length - 1].endMs : 0;

    // Start with all committed steps visible
    const visible = new Set<number>();
    const steps = stepsRef.current;
    for (let i = 0; i < committedCountRef.current; i++) {
      visible.add(steps[i]?.id ?? i);
    }

    if (total === 0 || (elapsed >= total && total > 0)) {
      // No new steps or all new steps done
      for (const t of tl) visible.add(t.step.id);
      setVisibleStepIds(prev => {
        if (prev.size === visible.size && [...visible].every(id => prev.has(id))) return prev;
        return visible;
      });
      if (tl.length > 0) {
        setCurrentStepIndex(committedCountRef.current + tl.length - 1);
        setStepProgress(1);
      }
      setState("complete");
      return;
    }

    let currentIdx = committedCountRef.current - 1;
    let progress = 0;

    for (let i = 0; i < tl.length; i++) {
      const { step, startMs, endMs } = tl[i];

      if (step.action.type === "clear" && elapsed >= startMs) {
        visible.clear();
        visible.add(step.id);
        currentIdx = committedCountRef.current + i;
        continue;
      }
      if (step.action.type === "erase" && elapsed >= startMs) {
        // Support both new targetStepIndices and legacy targetStepIds
        if (step.action.targetStepIndices) {
          for (const idx of step.action.targetStepIndices) {
            const target = steps[idx];
            if (target) visible.delete(target.id);
          }
        }
        if (step.action.targetStepIds) {
          for (const id of step.action.targetStepIds) visible.delete(id);
        }
        visible.add(step.id);
        currentIdx = committedCountRef.current + i;
        continue;
      }

      if (elapsed >= startMs) {
        visible.add(step.id);
        currentIdx = committedCountRef.current + i;
        progress = Math.min(1, (elapsed - startMs) / (endMs - startMs));
      }
    }

    setVisibleStepIds(prev => {
      if (prev.size === visible.size && [...visible].every(id => prev.has(id))) return prev;
      return visible;
    });
    setCurrentStepIndex(currentIdx);
    setStepProgress(progress);

    rafRef.current = requestAnimationFrame(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When new steps arrive, animate only the new ones
  useEffect(() => {
    if (steps.length === 0) {
      prevStepCountRef.current = 0;
      committedCountRef.current = 0;
      setState("idle");
      setVisibleStepIds(new Set());
      setCurrentStepIndex(-1);
      return;
    }

    const isNewSteps = steps.length > prevStepCountRef.current;
    prevStepCountRef.current = steps.length;
    if (!isNewSteps) return;

    // If we were complete or idle, commit previous steps and animate new ones
    if (state === "complete" || state === "idle") {
      // Commit all previously played steps so they stay visible
      // New steps = everything from committedCount onward
      // Don't advance committedCount here — tick() handles visibility
      cancelAnimationFrame(rafRef.current);
      startTimeRef.current = performance.now();
      setState("playing");
      rafRef.current = requestAnimationFrame(tick);
    }
    // If already playing, the tick loop will pick up new steps via updated timeline
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.length]);

  // When streaming ends and all steps played, commit them
  useEffect(() => {
    if (!isStreaming && state === "complete") {
      committedCountRef.current = steps.length;
    }
  }, [isStreaming, state, steps.length]);

  const play = useCallback(() => {
    if (stepsRef.current.length === 0) return;

    if (state === "paused") {
      const pausedElapsed = pausedAtRef.current;
      startTimeRef.current = performance.now() - pausedElapsed / speedRef.current;
    } else {
      // Replay new steps only
      startTimeRef.current = performance.now();
    }

    setState("playing");
    rafRef.current = requestAnimationFrame(tick);
  }, [state, tick]);

  const pause = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    pausedAtRef.current = (performance.now() - startTimeRef.current) * speedRef.current;
    setState("paused");
  }, []);

  const replay = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    // Replay everything from scratch
    committedCountRef.current = 0;
    // Rebuild timeline for all steps
    let cumulative = 0;
    timelineRef.current = stepsRef.current.map((step) => {
      const startMs = cumulative + step.delayMs;
      const endMs = startMs + step.durationMs;
      cumulative = endMs;
      return { step, startMs, endMs };
    });

    setVisibleStepIds(new Set());
    setCurrentStepIndex(-1);
    setStepProgress(0);
    startTimeRef.current = performance.now();
    setState("playing");
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const seekToStep = useCallback(
    (stepIndex: number) => {
      const currentSteps = stepsRef.current;
      if (stepIndex < 0 || stepIndex >= currentSteps.length) return;

      cancelAnimationFrame(rafRef.current);

      const visible = new Set<number>();
      for (let i = 0; i <= stepIndex; i++) {
        const step = currentSteps[i];
        if (step.action.type === "clear") {
          visible.clear();
          visible.add(step.id);
        } else if (step.action.type === "erase") {
          if (step.action.targetStepIndices) {
            for (const idx of step.action.targetStepIndices) {
              const target = currentSteps[idx];
              if (target) visible.delete(target.id);
            }
          }
          if (step.action.targetStepIds) {
            for (const id of step.action.targetStepIds) visible.delete(id);
          }
          visible.add(step.id);
        } else {
          visible.add(step.id);
        }
      }

      setVisibleStepIds(visible);
      setCurrentStepIndex(stepIndex);
      setStepProgress(1);
      setState("paused");
    },
    []
  );

  const changeSpeed = useCallback(
    (newSpeed: PlaybackSpeed) => {
      if (state === "playing") {
        const elapsed = (performance.now() - startTimeRef.current) * speedRef.current;
        setSpeed(newSpeed);
        startTimeRef.current = performance.now() - elapsed / newSpeed;
      } else {
        setSpeed(newSpeed);
      }
    },
    [state]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return {
    state: isStreaming && state === "complete" ? "playing" as PlayerState : state,
    currentStepIndex,
    stepProgress,
    visibleStepIds,
    speed,
    totalSteps: steps.length,
    steps,
    play,
    pause,
    replay,
    seekToStep,
    changeSpeed,
  };
}
