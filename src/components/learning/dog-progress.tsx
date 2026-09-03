"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Sprite cell size in the source PNG. The sheet is laid out as a
 * uniform grid; if a row has fewer frames than `SHEET_COLS`, the
 * trailing cells are blank — we only advance through the configured
 * `frames` count per state.
 */
const FRAME_W = 192;
const FRAME_H = 208;
const SHEET_COLS = 8;
const SHEET_ROWS = 9;

// How long the dog plays the running animation while sliding from one
// step to the next. Matches the CSS `left` transition below.
const SLIDE_MS = 1400;

// Canonical row/frame/duration map from the Codex Pets sprite spec.
// All non-run poses face left in the source art; the sheet ships two
// dedicated rows for run direction so the paw cadence stays correct.
export type DogState =
  | "idle"
  | "runRight"
  | "runLeft"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "review";

type AnimSpec = { row: number; frames: number; ms: number; loop: boolean };

const STATES: Record<DogState, AnimSpec> = {
  idle:     { row: 0, frames: 6, ms: 260, loop: true },
  // The sprite creator's "Run right" (row 1) and "Run left" (row 2)
  // labels are reversed — row 2 is the actually-right-facing run.
  runRight: { row: 2, frames: 8, ms: 260, loop: true },
  runLeft:  { row: 1, frames: 8, ms: 260, loop: true },
  waving:   { row: 3, frames: 4, ms: 350, loop: true },
  jumping:  { row: 4, frames: 5, ms: 280, loop: true },
  failed:   { row: 5, frames: 8, ms: 260, loop: true },
  waiting:  { row: 6, frames: 6, ms: 260, loop: true },
  review:   { row: 8, frames: 6, ms: 260, loop: true },
};

const TRANSIENT_STATES = new Set<DogState>(["failed", "jumping"]);

const BASE_DOG_HEIGHT = 56;
const BASE_BONE_HEIGHT = 30;
const BASE_TRACK_INSET = 28;
const BASE_CONTAINER_HEIGHT = 64;

export function DogProgress({
  state,
  progress,
  className = "",
  scale = 1,
}: {
  state: DogState;
  progress: number;
  className?: string;
  /** Uniform scale applied to the dog sprite, bone, and container height.
   *  The track itself still stretches to fill the parent width. */
  scale?: number;
}) {
  const DOG_HEIGHT = BASE_DOG_HEIGHT * scale;
  const DOG_WIDTH = (FRAME_W / FRAME_H) * DOG_HEIGHT;
  const BONE_HEIGHT = BASE_BONE_HEIGHT * scale;
  const TRACK_INSET = BASE_TRACK_INSET * scale;
  const CONTAINER_HEIGHT = BASE_CONTAINER_HEIGHT * scale;
  // Progress-driven slide override. When `progress` changes, the dog
  // animates to runRight / runLeft for the duration of the CSS slide,
  // then yields back to whatever the parent computed. Transient poses
  // (failed / jumping) win over the slide so a correct-then-advance
  // beat still flashes "jumping" before the run kicks in.
  const [slideState, setSlideState] = useState<DogState | null>(null);
  const lastProgressRef = useRef(progress);
  useEffect(() => {
    const prev = lastProgressRef.current;
    if (Math.abs(progress - prev) <= 0.001) return;
    const next: DogState = progress > prev ? "runRight" : "runLeft";
    setSlideState(next);
    lastProgressRef.current = progress;
    const id = window.setTimeout(() => setSlideState(null), SLIDE_MS + 20);
    return () => window.clearTimeout(id);
  }, [progress]);

  const effectiveState: DogState =
    slideState && !TRANSIENT_STATES.has(state) ? slideState : state;
  const spec = STATES[effectiveState];
  const specRef = useRef(spec);
  specRef.current = spec;

  const [frame, setFrame] = useState(0);
  useEffect(() => {
    setFrame(0);
    if (spec.frames <= 1) return;
    const interval = Math.max(1, spec.ms);
    const id = window.setInterval(() => {
      setFrame((f) => {
        const next = f + 1;
        if (next >= specRef.current.frames) {
          return specRef.current.loop ? 0 : specRef.current.frames - 1;
        }
        return next;
      });
    }, interval);
    return () => window.clearInterval(id);
  }, [effectiveState, spec.ms, spec.frames]);

  const clamped = Math.max(0, Math.min(1, progress));
  const sheetW = SHEET_COLS * DOG_WIDTH;
  const sheetH = SHEET_ROWS * DOG_HEIGHT;
  const bgX = -frame * DOG_WIDTH;
  const bgY = -spec.row * DOG_HEIGHT;

  return (
    <div
      className={`pointer-events-none relative w-full ${className}`}
      style={{ height: CONTAINER_HEIGHT }}
      aria-hidden
    >
      {/* dashed track */}
      <div
        className="absolute top-1/2 -translate-y-1/2 border-t border-dashed"
        style={{
          left: TRACK_INSET,
          right: TRACK_INSET,
          borderColor: "rgba(255,255,255,0.5)",
        }}
      />

      {/* bone goal at right end */}
      <img
        src="/beagle/bone.png"
        alt=""
        className="absolute top-1/2"
        style={{
          right: TRACK_INSET - BONE_HEIGHT / 2,
          height: BONE_HEIGHT,
          width: "auto",
          imageRendering: "pixelated",
          transform: "translateY(-50%) rotate(90deg)",
          transformOrigin: "center",
          filter:
            clamped >= 0.98
              ? "drop-shadow(0 0 8px rgba(255, 220, 100, 0.85))"
              : undefined,
          transition: "filter 300ms ease-out",
        }}
      />

      {/* dog sprite */}
      <div
        className="absolute top-1/2"
        style={{
          left: `calc(${TRACK_INSET}px + (100% - ${TRACK_INSET * 2 + DOG_WIDTH}px) * ${clamped})`,
          width: DOG_WIDTH,
          height: DOG_HEIGHT,
          // All stationary poses in the sheet face left; flip them so
          // the dog faces the bone. Run states keep their native
          // direction (runRight = row 2 already faces right; runLeft
          // stays left so the slide matches travel direction).
          transform: `translateY(-50%)${effectiveState === "runRight" || effectiveState === "runLeft" ? "" : " scaleX(-1)"}`,
          backgroundImage: "url('/beagle/dog-sheet.png')",
          backgroundPosition: `${bgX}px ${bgY}px`,
          backgroundSize: `${sheetW}px ${sheetH}px`,
          backgroundRepeat: "no-repeat",
          imageRendering: "pixelated",
          transition: `left ${SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        }}
      />
    </div>
  );
}

/**
 * Derives the dog's pose from the micro-lesson's existing signals.
 * Running while transitioning between steps is handled by DogProgress
 * itself (it watches `progress` and overrides the state for the slide
 * duration), so this hook only cares about *stationary* poses.
 *
 * Transient overrides:
 *  - `correctNonce` increment → "jumping" for 1.1s
 *  - `wrongNonce` increment   → "failed"  for 1.1s
 *
 * Input-waiting cycle: while the student has a pending question, the
 * dog rotates through {idle, waving, waiting, review} on a 2.5–4s
 * random schedule so the strip doesn't feel frozen.
 */
const INPUT_CYCLE_POOL: DogState[] = ["idle", "waving", "waiting", "review"];

export function useDogState(args: {
  isGenerating: boolean;
  isChatting: boolean;
  hasTakeover: boolean;
  hasPendingInteraction: boolean;
  orbState: "idle" | "thinking" | "speaking" | "listening";
  lessonPhase: "intro" | "lesson" | "wrap-up" | "practice" | "complete";
  correctNonce: number;
  wrongNonce: number;
}): DogState {
  const {
    isGenerating,
    isChatting,
    hasTakeover,
    hasPendingInteraction,
    orbState,
    lessonPhase,
    correctNonce,
    wrongNonce,
  } = args;

  const [transient, setTransient] = useState<DogState | null>(null);
  const lastCorrectRef = useRef(correctNonce);
  const lastWrongRef = useRef(wrongNonce);

  useEffect(() => {
    if (correctNonce > lastCorrectRef.current) {
      setTransient("jumping");
      lastCorrectRef.current = correctNonce;
      const id = window.setTimeout(() => setTransient(null), 1100);
      return () => window.clearTimeout(id);
    }
    lastCorrectRef.current = correctNonce;
  }, [correctNonce]);

  useEffect(() => {
    if (wrongNonce > lastWrongRef.current) {
      setTransient("failed");
      lastWrongRef.current = wrongNonce;
      const id = window.setTimeout(() => setTransient(null), 1100);
      return () => window.clearTimeout(id);
    }
    lastWrongRef.current = wrongNonce;
  }, [wrongNonce]);

  const [cycleState, setCycleState] = useState<DogState>("idle");
  const inputCycleActive =
    hasPendingInteraction &&
    !isGenerating &&
    !isChatting &&
    !hasTakeover &&
    !transient &&
    lessonPhase !== "complete";

  useEffect(() => {
    if (!inputCycleActive) return;
    let alive = true;
    let timeoutId: number;
    const tick = () => {
      if (!alive) return;
      setCycleState((prev) => {
        const candidates = INPUT_CYCLE_POOL.filter((s) => s !== prev);
        return candidates[Math.floor(Math.random() * candidates.length)];
      });
      const next = 2500 + Math.random() * 1500;
      timeoutId = window.setTimeout(tick, next);
    };
    tick();
    return () => {
      alive = false;
      window.clearTimeout(timeoutId);
    };
  }, [inputCycleActive]);

  if (lessonPhase === "complete") return "jumping";
  if (transient) return transient;
  if (isGenerating) return "waiting";
  if (isChatting || hasTakeover) return "waiting";
  if (hasPendingInteraction) return cycleState;
  if (orbState === "thinking") return "waiting";
  // Default stationary pose between progress changes. Running is no
  // longer triggered by narration — DogProgress drives it from the
  // actual slide so the dog runs *while it moves*, not while it stands.
  return "idle";
}
