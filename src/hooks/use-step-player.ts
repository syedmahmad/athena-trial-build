"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type {
  WhiteboardStep,
  CheckInAction,
  PredictAction,
  FillBlankAction,
  PulseCheckAction,
} from "@/types/whiteboard";

export type StepPlayerState = "idle" | "animating" | "waiting" | "awaiting_input" | "check_in" | "complete";

/** True for step types that pause the player and require student interaction. */
function isInteractionStep(step: WhiteboardStep): boolean {
  const t = step.action.type;
  return t === "check_in" || t === "predict" || t === "fill_blank" || t === "pulse_check";
}

/**
 * User-driven step player for sectioned progressive-reveal lessons.
 *
 * Whiteboard steps animate their clip-path reveal over `durationMs`.
 * Interaction steps (check_in, predict, fill_blank) pause and show a question.
 * Check-in steps also act as section boundaries — the board clears when
 * moving past a check-in into the next section.
 */
/** Step action types that "draw" a diagram (stroke-revealed). */
function isDrawnDiagram(step: WhiteboardStep): boolean {
  const t = step.action.type;
  return t === "geometry" || t === "coordinate_plane" || t === "number_line" || t === "draw_shape";
}

export function useStepPlayer(
  steps: WhiteboardStep[],
  isStreaming: boolean,
  opts?: { diagramDurationScale?: number },
) {
  // Stretch diagram reveals so drawn shapes don't snap in too fast (used by
  // the roaming-orb experience so the orb can visibly draw them). Defaults to
  // 1 — no change for every other caller.
  const diagramDurationScale = opts?.diagramDurationScale ?? 1;
  const [state, setState] = useState<StepPlayerState>("idle");
  const [userStepIndex, setUserStepIndex] = useState(-1);
  const [stepProgress, setStepProgress] = useState(0);
  const [visibleStepIds, setVisibleStepIds] = useState<Set<number>>(new Set());

  const rafRef = useRef(0);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  // True when user called advance() but the next step hasn't streamed in yet
  const pendingAdvanceRef = useRef(false);

  const isCheckInStep = useCallback((index: number) => {
    const step = stepsRef.current[index];
    return step?.action.type === "check_in";
  }, []);

  // Build visible set. Check-in steps defer clearing so the preceding
  // section's visuals remain visible during the question. The clear fires
  // on the first teaching step of the next section.
  // When `showAll` is true (hydration), skip clearing entirely.
  const buildVisibleIds = useCallback((upTo: number, showAll = false) => {
    const ids = new Set<number>();
    const allSteps = stepsRef.current;
    let pendingClear = false;
    for (let i = 0; i <= upTo && i < allSteps.length; i++) {
      const action = allSteps[i].action;
      if (action.type === "check_in") {
        if (!showAll) pendingClear = true;
        continue;
      }
      // predict/fill_blank/pulse_check don't render on canvas — skip them in visible set
      if (action.type === "predict" || action.type === "fill_blank" || action.type === "pulse_check") {
        continue;
      }
      if (pendingClear) {
        ids.clear();
        pendingClear = false;
      }
      if (action.type === "clear") {
        if (!showAll) ids.clear();
      } else if (action.type === "erase" && action.targetStepIndices) {
        if (!showAll) {
          for (const idx of action.targetStepIndices) {
            const target = allSteps[idx];
            if (target) ids.delete(target.id);
          }
        }
      }
      ids.add(allSteps[i].id);
    }
    return ids;
  }, []);

  // Start a step — animate if whiteboard, pause if interaction
  const startStep = useCallback(
    (index: number) => {
      cancelAnimationFrame(rafRef.current);
      const step = stepsRef.current[index];
      if (!step) return;

      pendingAdvanceRef.current = false;

      // Check-in step: section-boundary interaction
      if (step.action.type === "check_in") {
        setState("check_in");
        setVisibleStepIds(buildVisibleIds(index));
        setStepProgress(1);
        return;
      }

      // Predict / fill_blank / pulse_check: pause for student input.
      // pulse_check is a mid-TEACH soft probe (not a section boundary), but
      // it still gates the player on a click — same state.
      if (
        step.action.type === "predict" ||
        step.action.type === "fill_blank" ||
        step.action.type === "pulse_check"
      ) {
        setState("awaiting_input");
        setVisibleStepIds(buildVisibleIds(index));
        setStepProgress(1);
        return;
      }

      // Whiteboard step: animate clip-path reveal
      setState("animating");
      setStepProgress(0);
      setVisibleStepIds(buildVisibleIds(index));

      const startTime = performance.now();
      let duration = (step.durationMs || 800) * (isDrawnDiagram(step) ? diagramDurationScale : 1);
      // Orb mode: give multi-shape geometry steps extra time so the travel
      // gaps between shapes don't compress the actual drawing.
      if (diagramDurationScale !== 1 && step.action.type === "geometry") {
        const figureCount = Array.isArray(step.action.figures) ? step.action.figures.length : 0;
        if (figureCount > 1) duration *= 1 + 0.55 * (figureCount - 1);
      }

      const tick = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        setStepProgress(progress);

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setState("waiting");
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [buildVisibleIds, diagramDurationScale],
  );

  // Auto-start first step when it arrives
  useEffect(() => {
    if (steps.length > 0 && userStepIndex === -1) {
      setUserStepIndex(0);
      startStep(0);
    }
  }, [steps.length, userStepIndex, startStep]);

  // When streaming finishes and we're on the last step, mark complete
  useEffect(() => {
    if (
      !isStreaming &&
      userStepIndex >= 0 &&
      userStepIndex >= steps.length - 1 &&
      state === "waiting"
    ) {
      setState("complete");
    }
  }, [state, userStepIndex, steps.length, isStreaming]);

  // Advance to the next step (called by Continue button or after answering an interaction)
  const advance = useCallback(() => {
    const nextIndex = userStepIndex + 1;
    if (nextIndex < stepsRef.current.length) {
      setUserStepIndex(nextIndex);
      startStep(nextIndex);
    } else if (isStreaming) {
      // Next step hasn't arrived yet — flag it and wait
      pendingAdvanceRef.current = true;
      setState("waiting");
      setUserStepIndex(nextIndex);
    } else {
      // No more steps — lesson is done
      setState("complete");
    }
  }, [userStepIndex, isStreaming, startStep]);

  // When a new step streams in and the user already requested advance, auto-start it
  useEffect(() => {
    if (
      pendingAdvanceRef.current &&
      userStepIndex >= 0 &&
      userStepIndex < steps.length &&
      stepsRef.current[userStepIndex]
    ) {
      startStep(userStepIndex);
    }
  }, [userStepIndex, steps.length, startStep]);

  // Debug seek: jump to an arbitrary step index. Used by the scrubber
  // overlay to step backward (or forward) through a played lesson
  // without restarting from scratch. Skips animation — visible steps
  // settle at progress=1 so past content holds its final state.
  const seekTo = useCallback((index: number) => {
    if (steps.length === 0) return;
    const clamped = Math.max(0, Math.min(steps.length - 1, index));
    cancelAnimationFrame(rafRef.current);
    setUserStepIndex(clamped);
    setVisibleStepIds(buildVisibleIds(clamped, true));
    const step = stepsRef.current[clamped];
    if (step && isInteractionStep(step)) {
      setState(step.action.type === "check_in" ? "check_in" : "awaiting_input");
    } else {
      setState("waiting");
    }
    setStepProgress(1);
  }, [steps.length, buildVisibleIds]);

  // Re-trigger the current step's animation from the start. Used by
  // the scrubber's replay button to re-run clip-path / op-* span
  // animations without advancing to a new step.
  const replayCurrent = useCallback(() => {
    if (userStepIndex < 0 || userStepIndex >= stepsRef.current.length) return;
    startStep(userStepIndex);
  }, [userStepIndex, startStep]);

  // Jump to end — show only the last section's steps (for cached lesson hydration)
  const jumpToEnd = useCallback(() => {
    if (steps.length === 0) return;
    const lastIndex = steps.length - 1;
    setUserStepIndex(lastIndex);
    setStepProgress(1);
    setVisibleStepIds(buildVisibleIds(lastIndex, true));
    setState("complete");
    cancelAnimationFrame(rafRef.current);
  }, [steps.length, buildVisibleIds]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Find the "real" current whiteboard step index for the canvas
  // (skip interaction steps backwards to find the last visual step)
  let canvasStepIndex = userStepIndex;
  while (canvasStepIndex >= 0 && stepsRef.current[canvasStepIndex] && isInteractionStep(stepsRef.current[canvasStepIndex])) {
    canvasStepIndex--;
  }

  const canAdvance =
    state === "waiting" &&
    (userStepIndex < steps.length - 1 || isStreaming);

  const isLastStep =
    state === "complete" ||
    (state === "waiting" && !isStreaming && userStepIndex >= steps.length - 1);

  const currentStep = steps[userStepIndex];

  const currentCheckIn =
    state === "check_in" && currentStep?.action.type === "check_in"
      ? (currentStep.action as CheckInAction)
      : null;

  const currentPrediction =
    state === "awaiting_input" && currentStep?.action.type === "predict"
      ? (currentStep.action as PredictAction)
      : null;

  const currentFillBlank =
    state === "awaiting_input" && currentStep?.action.type === "fill_blank"
      ? (currentStep.action as FillBlankAction)
      : null;

  const currentPulseCheck =
    state === "awaiting_input" && currentStep?.action.type === "pulse_check"
      ? (currentStep.action as PulseCheckAction)
      : null;

  const isInteraction = state === "check_in" || state === "awaiting_input";

  return {
    state,
    userStepIndex,
    currentStepIndex: Math.max(canvasStepIndex, 0),
    stepProgress,
    visibleStepIds,
    canAdvance,
    isLastStep,
    isCheckIn: state === "check_in",
    currentCheckIn,
    isInteraction,
    currentPrediction,
    currentFillBlank,
    currentPulseCheck,
    advance,
    jumpToEnd,
    seekTo,
    replayCurrent,
    totalSteps: steps.length,
  };
}
