"use client";

import { useId } from "react";

/** Codex Pets atlas layout — every spritesheet uses the same 8×9 grid
 *  (8 frame columns, 9 state rows). Cells where the state needs fewer
 *  frames simply leave trailing columns blank; the cell pitch is still
 *  the full cellWidth so the step animation lines up. */
const ATLAS_COLS = 8;
const ATLAS_ROWS = 9;

const STATES = {
  idle: { row: 0, frames: 6 },
  "running-right": { row: 1, frames: 8 },
  "running-left": { row: 2, frames: 8 },
  waving: { row: 3, frames: 4 },
  jumping: { row: 4, frames: 5 },
  failed: { row: 5, frames: 8 },
  waiting: { row: 6, frames: 6 },
  running: { row: 7, frames: 6 },
  review: { row: 8, frames: 6 },
} as const;

type StateId = keyof typeof STATES;

/** Orb runtime states → animation rows. idle stays idle; speaking →
 *  waving (the natural "talking" gesture); listening → waiting (alert
 *  hold); thinking/processing → review (analytical). */
const ORB_TO_STATE: Record<string, StateId> = {
  idle: "idle",
  thinking: "review",
  processing: "review",
  speaking: "waving",
  listening: "waiting",
};

export type CodexPetSpriteData = {
  src: string;
  cellWidth: number;
  cellHeight: number;
};

type Props = {
  pet: CodexPetSpriteData;
  /** Visual state to animate. Defaults to "idle". */
  orbState?: string;
  /** When set, the character is travelling — play the running rows facing
   *  this direction instead of the orbState gesture. */
  movement?: "left" | "right" | null;
  /** Pixel size for the rendered cell. The sprite is scaled to fit
   *  while preserving aspect ratio. */
  size: number;
};

export function CodexPetSprite({ pet, orbState = "idle", movement = null, size }: Props) {
  // Unique animation name per instance so multiple sprites on the same
  // page don't collide on @keyframes (e.g. orb + picker chip showing
  // the same character in two different states).
  const animKey = useId().replace(/:/g, "_");

  // Walking overrides the gesture: while the orb roams/draws the pet runs
  // in the travel direction; at rest it falls back to the orbState mapping.
  const stateId: StateId =
    movement === "right"
      ? "running-right"
      : movement === "left"
        ? "running-left"
        : (ORB_TO_STATE[orbState] ?? "idle");
  const { row, frames } = STATES[stateId];
  const { cellWidth, cellHeight, src } = pet;

  const scale = Math.min(size / cellWidth, size / cellHeight);
  const renderW = cellWidth * scale;
  const renderH = cellHeight * scale;
  // Background must scale the FULL atlas (8 cols × 9 rows). If we only
  // sized for `frames` columns the browser would compress the atlas
  // horizontally and frame boundaries would no longer align with the
  // step animation.
  const bgW = ATLAS_COLS * cellWidth * scale;
  const bgH = ATLAS_ROWS * cellHeight * scale;
  const rowOffset = -row * cellHeight * scale;
  const frameStepPx = cellWidth * scale;
  const totalShiftPx = -frames * frameStepPx;

  // Per-state durations tuned for natural feel — idle slow ambient,
  // waving (speak) snappier, waiting (listen) calm, review measured.
  const durationMs =
    stateId === "idle"
      ? 900
      : stateId === "waving"
        ? 480
        : stateId === "waiting"
          ? 1200
          : stateId === "review"
            ? 1100
            : stateId === "running-left" || stateId === "running-right"
              ? 620
              : 800;

  const animationName = `codex-pet-${animKey}-${stateId}`;

  return (
    <>
      <style>{`@keyframes ${animationName} { from { background-position: 0 ${rowOffset}px; } to { background-position: ${totalShiftPx}px ${rowOffset}px; } }`}</style>
      <div
        aria-hidden="true"
        style={{
          width: renderW,
          height: renderH,
          backgroundImage: `url(${src})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${bgW}px ${bgH}px`,
          backgroundPosition: `0 ${rowOffset}px`,
          imageRendering: "pixelated",
          animation: `${animationName} ${durationMs}ms steps(${frames}) infinite`,
        }}
      />
    </>
  );
}
