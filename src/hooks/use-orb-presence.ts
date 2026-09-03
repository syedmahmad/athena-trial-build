"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useMotionValue, useSpring, useAnimationFrame, type MotionValue } from "framer-motion";
import { boardToClient, type StepFocus, type OrbSpotlight } from "@/components/whiteboard/pen-tip";

/**
 * Drives the roaming tutor orb ("Clicky-style" living presence).
 *
 * All positions are in **pixels relative to the presence layer** (the
 * absolute-inset-0 box that sits over the whiteboard canvas region). The
 * caller resolves anchors from DOM rects (getBoundingClientRect) and the
 * canvas coordinate space; this hook only turns a per-frame *target* into a
 * spring-smoothed position.
 *
 * Modes:
 *  - rest : orb idles at `restAnchor`, gently attracted toward / repelled
 *           from the user's cursor so it never sits on what they're reading.
 *  - draw : orb tracks `penTarget` (the pen-tip of the diagram being drawn).
 *  - dock : orb flies to `dockAnchor` (the "Extra Help" panel during a
 *           tutor takeover).
 *
 * The returned `x`/`y` are the orb-center coordinates (spring outputs);
 * `vx` is the horizontal velocity, used to pick running-left/right sprite
 * frames. `moving` is true while the orb is travelling appreciably.
 */
export type OrbMode = "rest" | "draw" | "dock";

export interface OrbPoint {
  x: number;
  y: number;
}

export interface UseOrbPresenceArgs {
  /** Flag gate — when false the hook is inert (no frame loop side effects). */
  enabled: boolean;
  mode: OrbMode;
  /** Resting position (orb center) in presence-layer px. */
  restAnchor: OrbPoint;
  /**
   * Pen-tip in **client (viewport) px**, published by the whiteboard canvas
   * each frame (draw mode). Converted to layer-local px here. Read from a ref
   * so per-frame updates never re-render.
   */
  penClientRef?: RefObject<OrbPoint | null>;
  /**
   * Current step location (rest mode). When present, the orb hovers beside
   * the latest content — to one side, switching sides periodically — instead
   * of parking at `restAnchor`. Read from a ref; re-measured each frame so it
   * tracks the board as it scrolls.
   */
  stepFocusRef?: RefObject<StepFocus | null>;
  /**
   * Spotlight on a part of a drawn shape (rest mode). When present the orb
   * walks to the standoff just outside the part instead of hovering beside the
   * step; takes priority over the step-side anchor, but an active drag wins.
   */
  spotlightRef?: RefObject<OrbSpotlight | null>;
  /**
   * Manual drag position (rest mode, layer-local px). When the user drags the
   * orb, it parks here until the next natural reposition (the side-switch
   * period elapses or the mode leaves rest), at which point the hook clears
   * this ref back to null.
   */
  dragTargetRef?: RefObject<OrbPoint | null>;
  /** Dock target in presence-layer px (dock mode); fallback if no ref. */
  dockAnchor?: OrbPoint | null;
  /**
   * Element to dock to in dock mode (the "Extra Help" panel). Measured each
   * frame; the orb parks at its top-center. Falls back to `dockAnchor` then
   * `restAnchor` when absent (e.g. panel not yet mounted).
   */
  dockTargetRef?: RefObject<HTMLElement | null>;
  /**
   * The presence-layer element. Used to convert the global cursor position
   * into layer-local px for the rest-mode attraction/repulsion force.
   */
  layerRef?: RefObject<HTMLElement | null>;
  /** Enable rest-mode cursor attraction/avoidance. */
  cursorAttract?: boolean;
  /** When true, collapse spring motion (prefers-reduced-motion). */
  reducedMotion?: boolean;
}

export interface OrbPresence {
  x: MotionValue<number>;
  y: MotionValue<number>;
  vx: MotionValue<number>;
  moving: MotionValue<boolean>;
  /** True when the caption should render ABOVE the orb (orb is above the step). */
  captionAbove: MotionValue<boolean>;
  /**
   * Walk direction for a codex-pet sprite: "left" | "right" while the orb is
   * travelling appreciably, "none" at rest. Hysteresis keeps it stable when
   * moving mostly vertically.
   */
  movement: MotionValue<"left" | "right" | "none">;
  /** Spotlight pulse position (layer px) + on/off, for the part-pointing ring. */
  spotlightX: MotionValue<number>;
  spotlightY: MotionValue<number>;
  spotlightOn: MotionValue<boolean>;
}

// Spring feel — rest/dock drift is loose and floaty; draw is snappier so the
// orb stays near the moving pen tip. "Bold first, then tune" per the plan.
// Stiff + lightly damped so the orb stays right on the leading edge while
// drawing (minimal trail) yet keeps a touch of life at rest.
const REST_SPRING = { stiffness: 240, damping: 20, mass: 0.7 } as const;
const DRAW_SPRING = { stiffness: 260, damping: 28, mass: 0.6 } as const;

// In draw mode the orb sits just off the pen tip — barely up and to the side,
// like the very tip of a pen, so it hugs the lead without covering the stroke.
const DRAW_OFFSET = { x: 10, y: -12 } as const;

// Velocity lead: project the draw target ahead along the pen's motion to
// cancel the spring's trail, so the orb rides ON the leading point instead of
// chasing it. Capped so sharp corners don't fling it.
const PEN_LEAD_MS = 95;
const PEN_LEAD_MAX = 48; // px

// Gentle organic bob so the orb always feels like it's floating, not parked.
// Smaller while drawing so the tracking still reads as controlled.
const FLOAT_AMP_REST = 9; // px
const FLOAT_AMP_DRAW = 4; // px

// Rest-mode cursor force. The orb is mildly pulled toward a standoff ring
// around the cursor, but strongly shoved out of a "reading bubble" close in
// so it never blocks what the user is looking at.
const READING_BUBBLE = 150; // px: hard no-go radius around the cursor
const ATTRACT_RANGE = 520; // px: beyond this the cursor is ignored
const ATTRACT_GAIN = 0.18; // fraction of the gap pulled toward standoff
const REPEL_GAIN = 1.0; // strength of the push out of the bubble
const MOVING_EPS = 0.6; // px/frame considered "in motion"
const DIR_THRESHOLD = 0.8; // px/frame horizontal step to flip walk facing
const CLAMP_MARGIN = 56; // px: keep the orb center this far from layer edges
const SIDE_PERIOD = 11000; // ms: how often the resting orb switches sides
const DOCK_GAP = 64; // px: orb center this far LEFT of the Extra Help panel edge
const STEP_INSET_MIN = 96; // px: minimum horizontal inset INTO the step
const STEP_INSET_FRAC = 0.16; // extra inset as a fraction of step width
const STEP_V_GAP = 30; // px: float above (or below) the step line
// Cap the effective step extent used for anchoring, so a full-canvas step
// (the quiz/mentor/practice case) doesn't fling the orb across the page;
// small lesson steps are well under these and behave exactly as before.
const MAX_STEP_W = 480; // px
const MAX_STEP_H = 260; // px

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Combined attraction/repulsion offset applied to the rest anchor. */
function cursorForce(anchor: OrbPoint, cursor: OrbPoint | null | undefined): OrbPoint {
  if (!cursor) return anchor;
  const dx = anchor.x - cursor.x;
  const dy = anchor.y - cursor.y;
  const dist = Math.hypot(dx, dy) || 0.0001;
  const ux = dx / dist;
  const uy = dy / dist;

  // Inside the reading bubble: push straight out to the bubble edge (plus a
  // little) so the orb yields hard.
  if (dist < READING_BUBBLE) {
    const push = (READING_BUBBLE - dist) * REPEL_GAIN;
    return { x: anchor.x + ux * push, y: anchor.y + uy * push };
  }

  // In the attraction band: ease the orb toward the standoff ring so it
  // drifts companionably near the cursor without crowding it.
  if (dist < ATTRACT_RANGE) {
    const targetDist = READING_BUBBLE + 60;
    const pull = (dist - targetDist) * ATTRACT_GAIN;
    return { x: anchor.x - ux * pull, y: anchor.y - uy * pull };
  }

  return anchor;
}

function resolveTarget(
  a: UseOrbPresenceArgs,
  restAnchor: OrbPoint,
  cursor: OrbPoint | null,
  dockPoint: OrbPoint | null,
  penPoint: OrbPoint | null,
): OrbPoint {
  switch (a.mode) {
    case "draw":
      return penPoint ?? restAnchor;
    case "dock":
      return dockPoint ?? a.dockAnchor ?? restAnchor;
    case "rest":
    default:
      return a.cursorAttract ? cursorForce(restAnchor, cursor) : restAnchor;
  }
}

/**
 * Resting anchor beside the current step: above-and-inset-left, or
 * below-and-inset-right, alternating over time. The step's effective extent
 * is capped (MAX_STEP_W/H) so a full-canvas step doesn't fling the orb across
 * the page; small lesson steps fall well under the cap and keep their local
 * "hover beside the line" feel. Returns null if no step focus.
 */
function stepSideAnchor(
  focus: StepFocus,
  layerRect: DOMRect,
  onLeft: boolean,
): OrbPoint | null {
  const tl = boardToClient(
    { x: focus.box.x, y: focus.box.y },
    focus.svg,
    focus.viewBoxWidth,
    focus.viewBoxHeight,
  );
  const br = boardToClient(
    { x: focus.box.x + focus.box.width, y: focus.box.y + focus.box.height },
    focus.svg,
    focus.viewBoxWidth,
    focus.viewBoxHeight,
  );
  const left = tl.x - layerRect.left;
  const top = tl.y - layerRect.top;
  // Cap how far right/down the anchor can reach so a huge step stays local.
  const right = Math.min(br.x - layerRect.left, left + MAX_STEP_W);
  const bottom = Math.min(br.y - layerRect.top, top + MAX_STEP_H);
  const inset = Math.max(STEP_INSET_MIN, (right - left) * STEP_INSET_FRAC);
  return {
    x: onLeft ? left + inset : right - inset,
    y: onLeft ? top - STEP_V_GAP : bottom + STEP_V_GAP,
  };
}

export function useOrbPresence(args: UseOrbPresenceArgs): OrbPresence {
  // Latest args read inside the frame loop without re-subscribing. Synced in
  // an effect (not during render) — one-frame staleness is harmless here.
  const argsRef = useRef(args);
  useEffect(() => {
    argsRef.current = args;
  });

  // Raw target (unsmoothed) — the spring chases this.
  const tx = useMotionValue(args.restAnchor.x);
  const ty = useMotionValue(args.restAnchor.y);

  const restSpring = args.reducedMotion ? { stiffness: 500, damping: 50, mass: 1 } : REST_SPRING;
  const x = useSpring(tx, restSpring);
  const y = useSpring(ty, restSpring);

  const vx = useMotionValue(0);
  const moving = useMotionValue(false);
  const captionAbove = useMotionValue(false);
  const movement = useMotionValue<"left" | "right" | "none">("none");
  const lastDir = useRef<"left" | "right">("right");
  const spotlightX = useMotionValue(0);
  const spotlightY = useMotionValue(0);
  const spotlightOn = useMotionValue(false);
  // Side-switch phase at which the current manual drag was parked; the drag is
  // released once the phase advances (a "natural" reposition).
  const dragPhase = useRef<number | null>(null);

  const prev = useRef<OrbPoint>({ x: args.restAnchor.x, y: args.restAnchor.y });
  // Previous pen-tip (client px) + timestamp, for velocity-lead in draw mode.
  const penPrev = useRef<{ x: number; y: number; t: number } | null>(null);

  // Track the cursor in viewport coords via a single passive listener — read
  // in the frame loop and converted to layer-local px, so pointer moves never
  // trigger React re-renders.
  const clientCursor = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      clientCursor.current = { x: e.clientX, y: e.clientY };
    };
    const onLeave = () => {
      clientCursor.current = null;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  useAnimationFrame((t) => {
    const a = argsRef.current;
    if (!a.enabled) return;

    // Convert the cursor into layer-local px (rest mode only).
    let cursor: OrbPoint | null = null;
    const rect = a.layerRef?.current?.getBoundingClientRect();
    if (a.mode === "rest" && a.cursorAttract && clientCursor.current && rect) {
      cursor = {
        x: clientCursor.current.x - rect.left,
        y: clientCursor.current.y - rect.top,
      };
    }

    // Dock just to the LEFT of the Extra Help panel (in the canvas area, near
    // its top) — not inside it, which the opaque panel would paint over.
    let dockPoint: OrbPoint | null = null;
    if (a.mode === "dock" && a.dockTargetRef?.current && rect) {
      const d = a.dockTargetRef.current.getBoundingClientRect();
      dockPoint = {
        x: d.left - rect.left - DOCK_GAP,
        y: d.top - rect.top + 64,
      };
    }

    // Convert the published pen-tip (client px) to layer-local px (draw mode),
    // lead it slightly along the pen's velocity so the orb rides ON the lead,
    // and nudge up/to-the-side so it doesn't cover the stroke.
    let penPoint: OrbPoint | null = null;
    if (a.mode === "draw" && a.penClientRef?.current && rect) {
      const pc = a.penClientRef.current;
      let leadX = 0;
      let leadY = 0;
      const p = penPrev.current;
      if (p && t > p.t) {
        const dt = t - p.t;
        leadX = clamp(((pc.x - p.x) / dt) * PEN_LEAD_MS, -PEN_LEAD_MAX, PEN_LEAD_MAX);
        leadY = clamp(((pc.y - p.y) / dt) * PEN_LEAD_MS, -PEN_LEAD_MAX, PEN_LEAD_MAX);
      }
      penPrev.current = { x: pc.x, y: pc.y, t };
      penPoint = {
        x: pc.x - rect.left + DRAW_OFFSET.x + leadX,
        y: pc.y - rect.top + DRAW_OFFSET.y + leadY,
      };
    } else {
      penPrev.current = null;
    }

    // Rest mode: hover beside the current step (alternating sides) instead of
    // the static corner anchor, so the orb follows the lesson as it unfolds.
    // On the "above the step" phase, the caption flips above the orb so it
    // doesn't cover the step.
    const phase = Math.floor(t / SIDE_PERIOD);
    let restAnchor = a.restAnchor;
    let capAbove = false;
    // Ignore a step focus whose SVG has detached (canvas unmounted) — its rect
    // would read as zeros and fling the orb around.
    const focus = a.stepFocusRef?.current;
    if (a.mode === "rest" && focus && focus.svg.isConnected && rect) {
      const onLeft = phase % 2 === 0;
      const beside = stepSideAnchor(focus, rect, onLeft);
      if (beside) {
        restAnchor = beside;
        capAbove = onLeft; // left phase = orb above the step
      }
    }

    // Spotlight override (rest mode): walk to the standoff just outside the
    // named shape part, and place the pulse at the exact part. Beats the
    // step-side anchor; an active drag (below) still wins.
    let spotOn = false;
    const sp = a.spotlightRef?.current;
    if (a.mode === "rest" && sp && sp.svg.isConnected && rect) {
      const a2c = boardToClient(sp.anchor, sp.svg, sp.viewBoxWidth, sp.viewBoxHeight);
      const p2c = boardToClient(sp.point, sp.svg, sp.viewBoxWidth, sp.viewBoxHeight);
      restAnchor = { x: a2c.x - rect.left, y: a2c.y - rect.top };
      spotlightX.set(p2c.x - rect.left);
      spotlightY.set(p2c.y - rect.top);
      capAbove = a2c.x >= p2c.x; // orb right of the part → caption to the right
      spotOn = true;
    }

    // Manual drag override (rest mode): the orb parks where the user dropped
    // it until the next side-switch (the phase advances); any non-rest mode
    // also releases it so the orb resumes following on return to rest.
    const drag = a.dragTargetRef?.current ?? null;
    if (a.mode === "rest" && drag) {
      if (dragPhase.current === null) dragPhase.current = phase;
      if (phase !== dragPhase.current) {
        if (a.dragTargetRef) a.dragTargetRef.current = null; // natural reposition reached
        dragPhase.current = null;
      } else {
        restAnchor = drag;
        spotOn = false; // dragged away — drop the pulse too
      }
    } else {
      if (a.mode !== "rest" && a.dragTargetRef?.current) a.dragTargetRef.current = null;
      dragPhase.current = null;
    }

    if (captionAbove.get() !== capAbove) captionAbove.set(capAbove);
    if (spotlightOn.get() !== spotOn) spotlightOn.set(spotOn);

    // Copy into a fresh object: resolveTarget may hand back a shared reference
    // (the restAnchor prop, the drag ref, a dock/step anchor), and the float +
    // clamp below MUTATE `target`. Mutating a shared source would accumulate
    // the float into it every frame and fling the orb across the page.
    const resolved = resolveTarget(a, restAnchor, cursor, dockPoint, penPoint);
    const target = { x: resolved.x, y: resolved.y };

    // Organic floating bob — two out-of-phase sines so the orb never sits
    // perfectly still. Muted while drawing; off entirely for reduced motion.
    if (!a.reducedMotion) {
      const amp = a.mode === "draw" ? FLOAT_AMP_DRAW : FLOAT_AMP_REST;
      target.x += Math.sin(t / 820) * amp;
      target.y += Math.sin(t / 1100 + 1.3) * amp * 0.8;
    }

    // Keep the orb on-screen — repulsion (or a stray pen/dock target) must
    // never shove it past the clipped layer edge.
    if (rect && rect.width > 0) {
      target.x = clamp(target.x, CLAMP_MARGIN, rect.width - CLAMP_MARGIN);
      target.y = clamp(target.y, CLAMP_MARGIN, rect.height - CLAMP_MARGIN);
    }

    tx.set(target.x);
    ty.set(target.y);

    const cx = x.get();
    const cy = y.get();
    const ddx = cx - prev.current.x;
    const ddy = cy - prev.current.y;
    vx.set(ddx);
    const isMoving = Math.hypot(ddx, ddy) > MOVING_EPS;
    moving.set(isMoving);

    // Walk direction with hysteresis: update left/right only on a clear
    // horizontal step (so vertical strokes keep the last facing), and clear
    // to "none" when the orb settles.
    if (isMoving) {
      if (ddx > DIR_THRESHOLD) lastDir.current = "right";
      else if (ddx < -DIR_THRESHOLD) lastDir.current = "left";
      if (movement.get() !== lastDir.current) movement.set(lastDir.current);
    } else if (movement.get() !== "none") {
      movement.set("none");
    }
    prev.current = { x: cx, y: cy };
  });

  return { x, y, vx, moving, captionAbove, movement, spotlightX, spotlightY, spotlightOn };
}

export const ORB_PRESENCE_CONSTANTS = {
  READING_BUBBLE,
  ATTRACT_RANGE,
  REST_SPRING,
  DRAW_SPRING,
};
