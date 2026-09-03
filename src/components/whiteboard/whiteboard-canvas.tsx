"use client";

import { useMemo, useRef, useEffect, useLayoutEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import type { WhiteboardStep, SelectedElement, MicroLessonOperation } from "@/types/whiteboard";
import { computeLayout, computeBoardHeight, getStepLayout, getStepLayoutByIndex } from "./layout-engine";
import type { LayoutResult } from "./layout-engine";
import { penTipForStep, boardToClient, shapePartBoard } from "./pen-tip";
import type { StepFocus, OrbSpotlight, PointableAction } from "./pen-tip";

/** Operations that break the `=`-alignment chain. Identify/setup rows
 *  are labels or section headers (e.g. `(x_1, y_1) = (1, 2)`) that
 *  happen to contain an `=` but aren't part of the same worked chain
 *  of reasoning as the substitute/simplify/conclude steps that follow
 *  — aligning them pulls the actual derivation sideways. Plot and
 *  highlight are usually non-write_math but listed here defensively
 *  in case an author uses them with write_math content. */
const CHAIN_BREAKING_OPS: ReadonlySet<MicroLessonOperation> = new Set([
  "identify",
  "setup",
  "plot",
  // Conclude steps often append narrative content after the `=`
  // (e.g. `x = 4  ⇒  (4, 0)`), so anchoring to the chain's `=` shifts
  // the whole equation visibly off-center to the right. Letting them
  // center naturally reads cleaner.
  "conclude",
]);

/** Action types that should not break the equals-alignment chain.
 *  Highlight / erase / clear sit invisibly between equations; callout
 *  occupies vertical space but isn't an equation, so a hint callout
 *  between two write_math rows shouldn't decouple their `=` alignment. */
const CHAIN_TRANSPARENT_ACTIONS: ReadonlySet<string> = new Set([
  "highlight",
  "erase",
  "clear",
  "callout",
]);

/** Max times a step's measured height can be updated. Guards against
 *  re-layout loops in the pathological case where measurements keep
 *  changing. Real usage is 2 (initial render + post-morph re-measure). */
const MAX_MEASURE_UPDATES = 5;
/** Height-diff below this (px) is treated as no change. Filters
 *  sub-pixel scrollHeight jitter that would otherwise cause re-renders. */
const HEIGHT_TOLERANCE_PX = 10;
/** Distance from bottom below which auto-scroll keeps following new steps. */
const FOLLOWING_THRESHOLD_PX = 150;
/** Distance from bottom above which the "See latest" button appears. */
const SEE_LATEST_THRESHOLD_PX = 300;

function shallowEqualSpanRects(
  a: Record<string, { centerX: number; top: number; bottom: number }>,
  b: Record<string, { centerX: number; top: number; bottom: number }>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    const ra = a[k];
    const rb = b[k];
    if (!rb) return false;
    if (
      Math.abs(ra.centerX - rb.centerX) >= 0.5 ||
      Math.abs(ra.top - rb.top) >= 0.5 ||
      Math.abs(ra.bottom - rb.bottom) >= 0.5
    )
      return false;
  }
  return true;
}

import { WbText } from "./elements/wb-text";
import { WbMath } from "./elements/wb-math";
import { WbRichText, hasInlineMath } from "./elements/wb-rich-text";
import { WbShape } from "./elements/wb-shape";
import { WbHighlight } from "./elements/wb-highlight";
import { WbCoordinatePlane } from "./elements/wb-coordinate-plane";
import { WbGeometry } from "./elements/wb-geometry";
import { WbNumberLine } from "./elements/wb-number-line";
import { WbTable } from "./elements/wb-table";
import { WbCallout } from "./elements/wb-callout";
import { WbImage } from "./elements/wb-image";
import { WbSectionHeading } from "./elements/wb-section-heading";
import { WbWordProblem } from "./elements/wb-word-problem";

type SVGRect = { x: number; y: number; width: number; height: number };

/** A single flying value en route from a source span (in a previous
 *  step's DOM) to a target span (in the current step's equation). On
 *  arrival, swaps the val span (target) to visible and the ghost var
 *  span to invisible, completing the in-place substitution. */
type FlyInFlightProps = {
  /** Stable React key. Bumps on replay to force remount + re-animate. */
  flightKey: string;
  /** Viewport-pixel coordinates of the flight start. */
  x1: number;
  y1: number;
  /** Viewport-pixel coordinates of the flight end. */
  x2: number;
  y2: number;
  /** Visible text content cloned from the source span. */
  text: string;
  /** Color cloned from the source span. */
  color: string;
  /** Font size in viewport pixels (already canvas-scaled). */
  fontSize: number;
  /** Delay before takeoff. ms. */
  delayMs: number;
  /** Flight duration. ms. */
  travelMs: number;
  /** "arc" or "linear" trajectory. */
  path: "arc" | "linear";
  /** CSS easing keyword. */
  easing: string;
  /** Fired at 75% of travel — start fading the variable name out so
   *  it's gone by the time the value lands on top of it. */
  onVarFade: () => void;
  /** Fired at 85% of travel — start fading the destination val span
   *  in (the swap is masked by the dissolving overlay). */
  onArrive: () => void;
};

function FlyInFlight({
  flightKey, x1, y1, x2, y2, text, color, fontSize, delayMs, travelMs, path, easing, onVarFade, onArrive,
}: FlyInFlightProps) {
  // Simple curve: gentle bow upward, just enough to suggest a path
  // rather than a straight line. Caps at 60px so the curve stays
  // subtle even on long flights.
  const dx = x2 - x1;
  const dy = y2 - y1;
  const bow = Math.min(60, Math.max(25, Math.abs(dy) * 0.12));
  const midX = x1 + dx * 0.5;
  const midY = Math.min(y1, y2) - bow;
  // Framer Motion's [start, mid, end] keyframe form bezier-interpolates
  // between the points, producing a smooth arc.
  const xKeyframes = path === "arc" ? [x1, midX, x2] : [x1, x2];
  const yKeyframes = path === "arc" ? [y1, midY, y2] : [y1, y2];
  // Translate the easing keyword into a Framer Motion ease. Framer
  // accepts standard CSS keywords ("easeIn") or [c1x, c1y, c2x, c2y]
  // arrays for cubic-bezier(...). Parse both forms.
  const ease = parseEase(easing);
  // Two timed events per flight:
  //   - onVarFade at 75%: start fading the variable name out (over
  //     ~25% of travel so it's gone by landing).
  //   - onArrive  at 85%: reveal the val span; overlaps the last
  //     sliver of the puff dissolve and the var fade-out so the
  //     swap is masked by the cross-fade.
  useEffect(() => {
    const tVar = setTimeout(onVarFade, delayMs + travelMs * 0.75);
    const tArrive = setTimeout(onArrive, delayMs + travelMs * 0.85);
    return () => {
      clearTimeout(tVar);
      clearTimeout(tArrive);
    };
    // The flight is keyed externally so a remount makes onArrive a
    // fresh closure. Re-running per flight is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightKey]);
  // Comet trail: render N ghost copies of the value, each lagging the
  // leader by progressive time offsets, with decreasing opacity, scale,
  // and increasing blur + glow. Same trajectory keyframes as the
  // leader so they trace the arc behind it. Particles render BEFORE
  // the leader so the leader paints on top.
  const TRAIL_PARTICLES = 12;
  const TRAIL_DELAY_STEP_MS = 55;
  const trailParticles: React.ReactNode[] = [];
  for (let i = 0; i < TRAIL_PARTICLES; i++) {
    // i=0 closest to the leader; i=TRAIL_PARTICLES-1 farthest back.
    const t = (i + 1) / TRAIL_PARTICLES; // 0..1 across the trail
    const particleOpacity = 0.55 * (1 - t * 0.92);
    const particleScale = 0.95 - t * 0.6;
    const particleDelayMs = delayMs + (i + 1) * TRAIL_DELAY_STEP_MS;
    const particleBlur = 1.0 + t * 2.5;
    const glowRadius = 6 + t * 8;
    trailParticles.push(
      <motion.div
        key={`${flightKey}-trail-${i}`}
        data-fly-in-trail={`${flightKey}-${i}`}
        initial={{ x: x1, y: y1, opacity: 0, scale: particleScale * 1.05 }}
        animate={{
          x: xKeyframes,
          y: yKeyframes,
          opacity: [0, particleOpacity, particleOpacity, 0],
          scale: [particleScale * 1.05, particleScale, particleScale * 1.02, particleScale * 0.4],
        }}
        transition={{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          x: { duration: travelMs / 1000, delay: particleDelayMs / 1000, ease: ease as any, times: path === "arc" ? [0, 0.5, 1] : undefined },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          y: { duration: travelMs / 1000, delay: particleDelayMs / 1000, ease: ease as any, times: path === "arc" ? [0, 0.5, 1] : undefined },
          opacity: { duration: travelMs / 1000, delay: particleDelayMs / 1000, times: [0, 0.12, 0.78, 1], ease: "linear" },
          scale: { duration: travelMs / 1000, delay: particleDelayMs / 1000, times: [0, 0.5, 0.78, 1], ease: "easeOut" },
        }}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          color,
          fontSize,
          fontFamily: "KaTeX_Main, 'Times New Roman', serif",
          fontStyle: "italic",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          translate: "-50% -50%",
          willChange: "transform, opacity, filter",
          // Blur grows along the tail so the comet dissolves into a
          // soft smear. drop-shadow at the same color as the value
          // gives it a slight glow halo so the tail doesn't read as
          // flat blur.
          filter: `blur(${particleBlur.toFixed(2)}px) drop-shadow(0 0 ${glowRadius.toFixed(1)}px ${color})`,
        }}
      >
        {text}
      </motion.div>,
    );
  }

  return (
    <>
      {trailParticles}
      <motion.div
        key={flightKey}
        data-fly-in-flight={flightKey}
        initial={{ x: x1, y: y1, opacity: 0, scale: 1.15 }}
        // Trajectory: 4 keyframes shaped to (a) glide in, (b) settle to
        // natural size mid-flight, (c) start to swell as it nears the
        // target, (d) puff up to ~1.6× and fade to 0 at landing — the
        // dissolve masks the swap to the static val span underneath.
        animate={{
          x: xKeyframes,
          y: yKeyframes,
          opacity: [0, 1, 1, 0],
          scale: [1.15, 1.0, 1.05, 1.6],
        }}
        transition={{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          x: { duration: travelMs / 1000, delay: delayMs / 1000, ease: ease as any, times: path === "arc" ? [0, 0.5, 1] : undefined },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          y: { duration: travelMs / 1000, delay: delayMs / 1000, ease: ease as any, times: path === "arc" ? [0, 0.5, 1] : undefined },
          opacity: { duration: travelMs / 1000, delay: delayMs / 1000, times: [0, 0.12, 0.78, 1], ease: "linear" },
          scale: { duration: travelMs / 1000, delay: delayMs / 1000, times: [0, 0.5, 0.78, 1], ease: "easeOut" },
        }}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          color,
          fontSize,
          fontFamily: "KaTeX_Main, 'Times New Roman', serif",
          fontStyle: "italic",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          // Center the text on its (x,y) anchor so trajectory math
          // matches span-center-to-span-center.
          translate: "-50% -50%",
          // Hardware-acceleration hint; helps Safari composite the
          // flying div smoothly without re-layout per frame.
          willChange: "transform, opacity",
          // Subtle glow on the leader matches the trail's drop-shadow
          // so the comet head and tail share an aesthetic.
          filter: `drop-shadow(0 0 5px ${color})`,
        }}
      >
        {text}
      </motion.div>
    </>
  );
}

function parseEase(easing: string): string | [number, number, number, number] {
  const m = easing.match(/cubic-bezier\(\s*([\d.\-]+)\s*,\s*([\d.\-]+)\s*,\s*([\d.\-]+)\s*,\s*([\d.\-]+)\s*\)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  return easing;
}

function rectsIntersect(a: SVGRect, b: SVGRect) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
         a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Convert a viewport DOMRect to SVG user-unit coordinates. */
function clientRectToSVG(rect: { left: number; top: number; right: number; bottom: number }, svg: SVGSVGElement): SVGRect | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const inv = ctm.inverse();
  const pt = svg.createSVGPoint();
  pt.x = rect.left; pt.y = rect.top;
  const tl = pt.matrixTransform(inv);
  pt.x = rect.right; pt.y = rect.bottom;
  const br = pt.matrixTransform(inv);
  return { x: tl.x - 4, y: tl.y - 2, width: br.x - tl.x + 8, height: br.y - tl.y + 4 };
}

/** Walk the KaTeX DOM and return the term text + constituent elements.
 *  Splits at .mrel (=, ≤, …) and .mbin (+, −, …). */
function findMathSelection(target: HTMLElement): { text: string; els: Element[] } {
  const fallback = { text: target.closest?.(".katex-html")?.textContent?.replace(/\s+/g, "").trim() ?? "", els: [] as Element[] };

  let base: Element | null = null;
  let cur: Element | null = target;
  while (cur) {
    if (cur.classList?.contains("base")) { base = cur; break; }
    cur = cur.parentElement;
  }
  if (!base) return fallback;

  let segment: Element | null = target as Element;
  while (segment && segment.parentElement !== base) segment = segment.parentElement;
  if (!segment) return { text: base.textContent?.replace(/\s+/g, "").trim() ?? "", els: [base] };

  // Operator clicked — return just that one element
  if (segment.classList.contains("mrel") || segment.classList.contains("mbin")) {
    return { text: segment.textContent?.trim() ?? "", els: [segment] };
  }

  const siblings = Array.from(base.children);
  let start = siblings.indexOf(segment as HTMLElement);
  let end = start;
  const isSep = (el: Element) =>
    el.classList.contains("mrel") ||
    el.classList.contains("mbin") ||
    el.classList.contains("mspace");
  while (start > 0 && !isSep(siblings[start - 1])) start--;
  while (end < siblings.length - 1 && !isSep(siblings[end + 1])) end++;

  const range = siblings.slice(start, end + 1);
  const textEls = range.filter(el => !el.classList.contains("mspace") && !el.classList.contains("mbin"));
  const text = textEls.map(el => el.textContent ?? "").join("").replace(/\s+/g, "").trim()
    || (base.textContent?.replace(/\s+/g, "").trim() ?? "");

  // All elements in range (including spaces) used for bounding rect
  const visibleEls = range.filter(el => !el.classList.contains("mspace"));
  return { text, els: visibleEls.length ? visibleEls : [segment] };
}

type WhiteboardCanvasProps = {
  steps: WhiteboardStep[];
  visibleStepIds: Set<number>;
  currentStepIndex: number;
  stepProgress: number;
  equalScaleCoords?: boolean;
  /** Width of the content-coordinate space the steps are laid out in.
   *  Defaults to 1000 (the historical board). A narrower value (e.g. the
   *  tutor-takeover side panel) reflows the same steps onto a tighter
   *  board so they render LARGER for a given rendered pixel width —
   *  canvasScale = renderedWidth / contentWidth, and the SVG viewBox /
   *  HTML overlay are sized to match. */
  contentWidth?: number;
  /** Bumped by the parent to re-arm "follow latest" and pin to the most
   *  recent visible step. The student answering an interaction or pressing
   *  a transport button should always reveal the resuming content, even if
   *  a prior scroll-up (or the question panel shrinking the viewport) had
   *  latched `isFollowing` off. Monotonic counter; a change is the signal. */
  resumeFollowNonce?: number;
  selections?: SelectedElement[];
  onElementSelect?: (el: SelectedElement | null) => void;
  onElementToggle?: (el: SelectedElement) => void;
  onElementsSelect?: (els: SelectedElement[]) => void;
  /**
   * Roaming-orb hook (?debug=orb). Called as a diagram step reveals with the
   * current pen-tip in **client (viewport) px**, or null when the current
   * step isn't a drawn diagram. Must be a stable, render-cheap callback
   * (write to a ref) — it fires every animation frame during a draw.
   */
  onPenTip?: (clientPoint: { x: number; y: number } | null) => void;
  /**
   * Roaming-orb mode (?debug=orb). When true, multi-figure geometry steps
   * draw their shapes sequentially (so the orb can pen each in turn) instead
   * of all at once. Off = unchanged simultaneous reveal.
   */
  sequentialDiagrams?: boolean;
  /**
   * Roaming-orb hook (?debug=orb). Publishes the current step's location so
   * the resting orb can hover beside the latest content. Ref-writer in the
   * parent — fires when the current step / layout changes.
   */
  onStepFocus?: (focus: StepFocus | null) => void;
  /**
   * Roaming-orb hook (?debug=orb). Publishes a spotlight (a part of a drawn
   * geometry shape) for the current step's `orbFocus`, so the orb can walk to
   * it and pulse it. Null when the step has no orbFocus or it can't resolve.
   */
  onOrbSpotlight?: (spotlight: OrbSpotlight | null) => void;
};

const selKey = (el: SelectedElement) => `${el.stepId}:${el.content}`;

export function WhiteboardCanvas({
  steps: rawSteps,
  visibleStepIds,
  currentStepIndex,
  stepProgress,
  equalScaleCoords,
  contentWidth = 1000,
  resumeFollowNonce = 0,
  selections = [],
  onElementSelect,
  onElementToggle,
  onElementsSelect,
  onPenTip,
  sequentialDiagrams = false,
  onStepFocus,
  onOrbSpotlight,
}: WhiteboardCanvasProps) {
  // Extra scroll room below the last step (orb mode) so the orb + caption stay
  // visible when the orb floats below the content. Kept as a named value
  // because it inflates scrollHeight — every scroll calc that treats
  // scrollHeight as the *content* height must subtract it, or the auto-follow
  // over-scrolls (worse toward the end of the lesson).
  const orbScrollPad = sequentialDiagrams ? 220 : 0;
  // Normalize legacy `substitutionAnimation` into `flyInSubstitution`
  // so existing DB-stored lessons get the new dramatic animation
  // without a DB migration. The cross-fade and fly-in have the same
  // input shape (var/val pairs + fromLatex), so the conversion is
  // mechanical.
  const steps = useMemo<WhiteboardStep[]>(() => {
    return rawSteps.map((step) => {
      if (step.flyInSubstitution) return step;
      if (!step.substitutionAnimation) return step;
      return {
        ...step,
        flyInSubstitution: {
          fromLatex: step.substitutionAnimation.fromLatex,
          pairs: step.substitutionAnimation.sequence.map((p) => ({
            fromSpan: p.fromSpan,
            toSpan: p.toSpan,
          })),
        },
        substitutionAnimation: undefined,
      };
    });
  }, [rawSteps]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // Rendered width of the scroll container, tracked via ResizeObserver
  // so the SVG can be sized in EXPLICIT pixels (width / height attrs)
  // rather than via CSS aspectRatio. Explicit pixel sizing is the only
  // SVG sizing primitive that's deterministic across Chrome and Safari
  // — both engines compute scrollHeight, getScreenCTM, and
  // getBoundingClientRect consistently when the SVG box has a known
  // pixel size. CSS aspect-ratio on <svg> (and on a wrapper div) has
  // both well-documented Safari quirks and inconsistent behavior with
  // intrinsic SVG sizing.
  const [renderedWidth, setRenderedWidth] = useState(0);
  const [measuredHeights, setMeasuredHeights] = useState<Map<number, number>>(new Map());
  const [hoveredStepId, setHoveredStepId] = useState<number | null>(null);
  // Map from selKey → SVG bounding rect, computed at click time from DOM positions
  const [selectionRects, setSelectionRects] = useState<Map<string, SVGRect>>(new Map());
  // Per-step count of how many times wb-math has reported a measured
  // height. Capped in handleMeasure so a degenerate re-measure loop
  // can't keep triggering re-layouts, but allows enough updates for
  // the legitimate pre-morph → post-morph height change on collapse
  // steps (otherwise phantom pixels accumulate in the viewBox and the
  // auto-scroll drifts past the current content).
  const measurementCounts = useRef(new Map<number, number>());
  // stepId -> horizontal center of its `=` sign (in container pixels).
  // Fed from wb-math's onEqMeasure. Used to compute per-group align
  // offsets so triplet members' = signs land on a common column.
  const [eqCenters, setEqCenters] = useState<Map<number, number | null>>(new Map());
  // stepId -> { centerX, width } of the rendered equation's bounding box
  // (in container pixels). Used to size highlight rects to the actual
  // visible equation rather than the full row width.
  const [eqBBoxes, setEqBBoxes] = useState<Map<number, { centerX: number; width: number }>>(new Map());
  // stepId -> horizontal center of its first op-new span (container pixels).
  // Used to aim the step-to-step arrow at the newly-introduced operand
  // rather than the step's geometric center.
  const [opNewCenters, setOpNewCenters] = useState<Map<number, number | null>>(new Map());
  // stepId -> { spanId -> {centerX, top, bottom} } for named spans that
  // cross-step incomingArrows reference. Populated from WbMath via
  // onSpanRects. Used to route specific span-to-span arrows.
  type SpanRect = { centerX: number; top: number; bottom: number };
  const [spanRects, setSpanRects] = useState<Map<number, Record<string, SpanRect>>>(new Map());
  // Per-step set of pair indices whose flying value has landed.
  // Passed to WbMath as a snapshot so re-renders that re-fire the
  // main render effect don't re-hide val spans for pairs that have
  // already arrived (otherwise visible values snap back to opacity 0).
  const [arrivedPairs, setArrivedPairs] = useState<Map<number, Set<number>>>(new Map());
  // Per-step set of pair indices whose VARIABLE has begun fading out
  // (at 75% of its flight). Passed to WbMath so re-renders keep the
  // var at opacity 0 instead of snapping it back to 1.
  const [fadedPairs, setFadedPairs] = useState<Map<number, Set<number>>>(new Map());
  // Per-step flag: true once ALL pairs have arrived AND a short dwell
  // has elapsed. Triggers val spans to animate their `padding-right`
  // from the held ghost-width footprint back to 0 — one smooth
  // contraction at the end instead of per-pair expand/contract during
  // the morph (which reads as jerky surrounding geometry).
  const [settledSteps, setSettledSteps] = useState<Set<number>>(new Set());
  // Distribution arrows — for each visible step where
  // operation === "distribute" && phase === "apply", we draw curved
  // arrows from the multiplier's `.dist-src` span on the previous
  // visible write_math step to each `.op-new` span on this step. No
  // schema change: the apply step's own metadata + the prior step's
  // tagged span are all we need.
  type DistArrows = { src: { x: number; y: number }; targets: { x: number; y: number }[] };
  const [distributionArrows, setDistributionArrows] = useState<Map<number, DistArrows>>(new Map());

  // Rubber-band drag state
  const [dragRect, setDragRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const dragStartRef = useRef<{ svgX: number; svgY: number } | null>(null);
  const isDraggingRef = useRef(false);
  const justDraggedRef = useRef(false);

  const clientToSVG = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const inv = ctm.inverse();
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const r = pt.matrixTransform(inv);
    return { x: r.x, y: r.y };
  }, []);

  const handleSVGMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const isOnElement = !!(e.target as Element).closest?.("[data-wbstep]");
    if (isOnElement) return;
    const pos = clientToSVG(e.clientX, e.clientY);
    if (!pos) return;
    dragStartRef.current = { svgX: pos.x, svgY: pos.y };
    isDraggingRef.current = false;
  }, [clientToSVG]);

  // Track scrollRef's clientWidth so the SVG can size in explicit
  // pixels. useLayoutEffect for synchronous initial measurement (so
  // the first paint already has correct sizing). ResizeObserver picks
  // up later container resizes (window resize, parent layout shifts).
  // Capped at MAX_CANVAS_WIDTH so on very wide displays the SVG (and
  // the equations rendered inside its viewBox) don't scale up to
  // unreadable sizes — viewBox is 1000 wide and fontSizes are
  // calibrated for ~960px rendered width.
  const MAX_CANVAS_WIDTH = 1100;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setRenderedWidth(Math.min(el.clientWidth, MAX_CANVAS_WIDTH));
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width);
        if (w > 0) setRenderedWidth(Math.min(w, MAX_CANVAS_WIDTH));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Prune rects for items no longer in selections
  useEffect(() => {
    if (selections.length === 0) {
      setSelectionRects(prev => prev.size === 0 ? prev : new Map());
      return;
    }
    setSelectionRects(prev => {
      const keys = new Set(selections.map(selKey));
      const next = new Map<string, SVGRect>();
      for (const [k, v] of prev) if (keys.has(k)) next.set(k, v);
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [selections]);

  // Build two structures from the step array at once:
  //   simplifiedLatexByStepId : collapse step id -> the state step's latex.
  //     wb-math uses this to morph the collapse's visual to its
  //     simplified form after the op-cancel fade.
  //   hiddenStepIds : state step ids whose content has already been
  //     shown by a preceding collapse's simplify-morph. Those state
  //     steps get zero-height in layout and no wb-math render so the
  //     simplified equation doesn't appear twice on the board.
  const { simplifiedLatexByStepId, hiddenStepIds } = useMemo(() => {
    const latexMap = new Map<number, string>();
    const hidden = new Set<number>();
    type Bucket = {
      collapseId?: number;
      stateId?: number;
      stateLatex?: string;
      stateActionType?: string;
    };
    const byGroup: Record<string, Bucket> = {};
    // [lesson-triplet] diagnostic — track every step that contributes
    // to (or fails to contribute to) the COLLAPSE↔STATE morph pairing.
    // Orphans (a step with a phase but no operationGroupId, or a state
    // step whose action isn't write_math) prevent the morph from
    // applying and cause the two equations to render as distinct rows
    // with a normal layout gap — i.e. the "huge space" symptom.
    const orphans: Array<{ id: number; phase?: string; reason: string }> = [];
    for (const step of steps) {
      if (!step.operationGroupId) {
        if (step.phase === "collapse" || step.phase === "state") {
          orphans.push({
            id: step.id,
            phase: step.phase,
            reason: "missing-operationGroupId",
          });
        }
        continue;
      }
      const bucket = byGroup[step.operationGroupId] ?? {};
      if (step.phase === "collapse") bucket.collapseId = step.id;
      if (step.phase === "state") {
        bucket.stateId = step.id;
        bucket.stateActionType = step.action.type;
        if (step.action.type === "write_math") {
          bucket.stateLatex = (step.action as { latex: string }).latex;
        }
      }
      byGroup[step.operationGroupId] = bucket;
    }
    for (const { collapseId, stateId, stateLatex } of Object.values(byGroup)) {
      if (collapseId !== undefined && stateLatex) {
        latexMap.set(collapseId, stateLatex);
        if (stateId !== undefined) hidden.add(stateId);
      }
    }
    // Adjacent-callout collapse — a `callout` step that sits
    // immediately before a triplet APPLY step (no other content
    // between them) inflates the vertical space between the setup
    // row and the apply row by its full measured height (~110u for
    // standard callouts), AND forces the distribute arrow to draw
    // across the callout. Visually this is the "huge space for the
    // 3(x+4) distribution" symptom. The callout's pedagogical text
    // is usually duplicated by the apply step's narration anyway,
    // so we suppress it from layout + render when this intercession
    // pattern is detected. Logs each suppression so the watching
    // session can see it firing.
    const isLayoutContent = (t: string) =>
      t !== "highlight" && t !== "erase" && t !== "clear" &&
      t !== "check_in" && t !== "predict" && t !== "fill_blank" &&
      t !== "pulse_check";
    for (let i = 0; i < steps.length; i++) {
      const callout = steps[i];
      if (callout.action.type !== "callout") continue;
      // Find the next layout-affecting step.
      let nextIdx = -1;
      for (let j = i + 1; j < steps.length; j++) {
        if (isLayoutContent(steps[j].action.type)) {
          nextIdx = j;
          break;
        }
      }
      if (nextIdx === -1) continue;
      const next = steps[nextIdx];
      if (next.action.type !== "write_math") continue;
      if (next.phase !== "apply") continue;
      hidden.add(callout.id);
      if (typeof window !== "undefined") {
        console.debug(
          "[lesson-triplet] suppressed adjacent callout",
          {
            calloutId: callout.id,
            applyId: next.id,
            applyOperation: next.operation,
            applyGroup: next.operationGroupId,
          },
        );
      }
    }
    if (typeof window !== "undefined") {
      const groupSummary = Object.entries(byGroup).map(
        ([gid, { collapseId, stateId, stateLatex, stateActionType }]) => {
          const paired = collapseId !== undefined && stateLatex !== undefined;
          return {
            gid,
            collapseId,
            stateId,
            stateActionType,
            paired,
            reason: paired
              ? "ok"
              : collapseId === undefined
                ? "no-collapse"
                : stateId === undefined
                  ? "no-state"
                  : `state-not-write_math (${stateActionType ?? "unknown"})`,
          };
        },
      );
      const unpaired = groupSummary.filter((g) => !g.paired);
      if (unpaired.length > 0 || orphans.length > 0) {
        console.debug(
          "[lesson-triplet] pairing failures detected",
          { unpaired, orphans, totalGroups: groupSummary.length, totalSteps: steps.length },
        );
      } else if (groupSummary.length > 0) {
        console.debug(
          "[lesson-triplet] all groups paired",
          { groups: groupSummary.length, hidden: hidden.size },
        );
      }
    }
    return {
      simplifiedLatexByStepId: latexMap,
      hiddenStepIds: hidden,
    };
  }, [steps]);

  const layout = useMemo(
    () => computeLayout(steps, visibleStepIds, measuredHeights, { equalScaleCoords, hiddenStepIds, contentWidth }),
    [steps, visibleStepIds, measuredHeights, equalScaleCoords, hiddenStepIds, contentWidth],
  );

  const layoutMap = useMemo(() => {
    const map = new Map<number, LayoutResult>();
    for (const r of layout) map.set(r.stepId, r);
    return map;
  }, [layout]);

  const viewBoxHeight = useMemo(() => computeBoardHeight(layout), [layout]);

  // Publish the pen-tip for the roaming orb (?debug=orb). Fires as the current
  // diagram step reveals (stepProgress drives it every frame). onPenTip is a
  // ref-writer in the parent — no setState, so no extra render churn. Reports
  // null whenever the current step isn't a drawn diagram so the orb falls back
  // to its rest/dock behavior.
  useEffect(() => {
    if (!onPenTip) return;
    const svg = svgRef.current;
    const step = steps[currentStepIndex];
    const box = step ? layoutMap.get(step.id) : undefined;
    if (!svg || !step || !box) {
      onPenTip(null);
      return;
    }
    const tip = penTipForStep(step, stepProgress, box);
    if (!tip) {
      onPenTip(null);
      return;
    }
    onPenTip(boardToClient(tip, svg, contentWidth, viewBoxHeight));
  }, [onPenTip, steps, currentStepIndex, stepProgress, layoutMap, contentWidth, viewBoxHeight]);

  // Publish the current step's location so the resting orb can hover beside
  // the latest content. Updates on step / layout change; the orb re-reads the
  // SVG rect each frame so it stays put as the board scrolls.
  useEffect(() => {
    if (!onStepFocus) return;
    const svg = svgRef.current;
    const step = steps[currentStepIndex];
    const box = step ? layoutMap.get(step.id) : undefined;
    if (!svg || !box) {
      onStepFocus(null);
      return;
    }
    onStepFocus({ box, svg, viewBoxWidth: contentWidth, viewBoxHeight });
    // No unmount cleanup that publishes null — that flickered the focus on
    // every dep-change re-run. The hook ignores a detached SVG (isConnected)
    // instead, which covers the unmount case without the churn.
  }, [onStepFocus, steps, currentStepIndex, layoutMap, contentWidth, viewBoxHeight]);

  // Publish the orb spotlight: when the current step's orbFocus names a part of
  // a still-visible geometry shape, resolve it to a board point + standoff so
  // the orb can walk to it and pulse it.
  useEffect(() => {
    if (!onOrbSpotlight) return;
    const svg = svgRef.current;
    const focus = steps[currentStepIndex]?.orbFocus;
    if (!svg || !focus) {
      onOrbSpotlight(null);
      return;
    }
    // Resolve the referenced diagram step: explicit refStepId, else the most
    // recent visible pointable diagram (geometry / coordinate plane / number
    // line) at or before the current one.
    const isPointable = (s: WhiteboardStep) =>
      s.action.type === "geometry" ||
      s.action.type === "coordinate_plane" ||
      s.action.type === "number_line";
    let geomStep: WhiteboardStep | undefined;
    if (focus.refStepId != null) {
      geomStep = steps.find((s) => s.id === focus.refStepId);
    } else {
      for (let i = Math.min(currentStepIndex, steps.length - 1); i >= 0; i--) {
        const s = steps[i];
        if (isPointable(s) && visibleStepIds.has(s.id)) {
          geomStep = s;
          break;
        }
      }
    }
    const box = geomStep ? layoutMap.get(geomStep.id) : undefined;
    if (!geomStep || !isPointable(geomStep) || !box || !visibleStepIds.has(geomStep.id)) {
      onOrbSpotlight(null);
      return;
    }
    const resolved = shapePartBoard(geomStep.action as PointableAction, focus.part, box, {
      equalScale: !!equalScaleCoords,
    });
    if (!resolved) {
      onOrbSpotlight(null);
      return;
    }
    onOrbSpotlight({ ...resolved, svg, viewBoxWidth: contentWidth, viewBoxHeight });
  }, [onOrbSpotlight, steps, currentStepIndex, layoutMap, visibleStepIds, contentWidth, viewBoxHeight, equalScaleCoords]);

  // [layout] diagnostic — log two signals:
  //   1. Any consecutive-visible-row gap > 40 units (canonical GAP=16;
  //      anything bigger means a hidden step contributed slack or a
  //      measured height blew up).
  //   2. Any visible step taller than 100 units (write_math should be
  //      ~50-90; anything bigger is consuming room that *looks* like a
  //      gap to a human eye even though the layout reports it as height).
  // Both fire from the same effect to avoid double-render churn.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (layout.length < 2) return;
    const visibleRows = layout
      .filter((r) => r.height > 0)
      .sort((a, b) => a.y - b.y);
    const enrich = (row: LayoutResult) => {
      const step = steps.find((s) => s.id === row.stepId);
      return {
        id: row.stepId,
        y: Math.round(row.y),
        height: Math.round(row.height),
        actionType: step?.action.type,
        phase: step?.phase,
        operationGroupId: step?.operationGroupId,
        operation: step?.operation,
      };
    };
    for (let i = 1; i < visibleRows.length; i++) {
      const prev = visibleRows[i - 1];
      const cur = visibleRows[i];
      const gap = cur.y - (prev.y + prev.height);
      if (gap > 40) {
        console.debug(
          "[layout] unusually large row gap",
          { gap: Math.round(gap), prev: enrich(prev), cur: enrich(cur) },
        );
      }
    }
    for (const row of visibleRows) {
      if (row.height > 100) {
        console.debug("[layout] tall row", enrich(row));
      }
    }
    // Always dump the visible-row table on any layout change. Quiet
    // when nothing changes (memo'd layout) but loud enough to debug
    // the "why is the gap so big" question — gives us actual numbers
    // for every row instead of guessing thresholds.
    console.debug(
      "[layout] visible-rows",
      visibleRows.map((r) => enrich(r)),
    );
  }, [layout, steps]);

  // Callback for wb-math to report its `=` sign center. Only stores
  // the value if it actually changed, to avoid re-render churn.
  const handleEqMeasure = useCallback((stepId: number, centerX: number | null) => {
    setEqCenters((prev) => {
      const existing = prev.get(stepId);
      if (existing === centerX) return prev;
      if (
        existing != null &&
        centerX != null &&
        Math.abs(existing - centerX) < 0.5
      ) {
        return prev;
      }
      const next = new Map(prev);
      next.set(stepId, centerX);
      return next;
    });
  }, []);

  // Callback for wb-math to report the rendered equation's bounding box.
  // Last reported wins — collapse steps remeasure post-morph and we want
  // the highlight to track the FINAL displayed equation's bbox.
  const handleEqBBoxMeasure = useCallback(
    (stepId: number, bbox: { centerX: number; width: number } | null) => {
      if (!bbox) return;
      setEqBBoxes((prev) => {
        const existing = prev.get(stepId);
        if (
          existing &&
          Math.abs(existing.centerX - bbox.centerX) < 0.5 &&
          Math.abs(existing.width - bbox.width) < 0.5
        ) {
          return prev;
        }
        const next = new Map(prev);
        next.set(stepId, bbox);
        return next;
      });
    },
    [],
  );

  const handleSpanRects = useCallback(
    (stepId: number, rects: Record<string, SpanRect>) => {
      setSpanRects((prev) => {
        const existing = prev.get(stepId);
        if (existing && shallowEqualSpanRects(existing, rects)) return prev;
        const next = new Map(prev);
        next.set(stepId, rects);
        return next;
      });
    },
    [],
  );

  // Callback for wb-math to report its first op-new span's center.
  const handleOpNewMeasure = useCallback((stepId: number, centerX: number | null) => {
    setOpNewCenters((prev) => {
      const existing = prev.get(stepId);
      if (existing === centerX) return prev;
      if (
        existing != null &&
        centerX != null &&
        Math.abs(existing - centerX) < 0.5
      ) {
        return prev;
      }
      const next = new Map(prev);
      next.set(stepId, centerX);
      return next;
    });
  }, []);

  // For each step, the set of htmlClass ids whose bounding rects wb-math
  // should report via onSpanRects. A step needs its own toSpanId measured
  // (destination of an incoming cross-step arrow) and its immediate
  // predecessor needs the matching fromSpanId measured (source of that
  // same arrow). Returned as a Map<stepId, readonly string[]> so it's
  // stable to pass as a prop.
  const spanIdsByStep = useMemo(() => {
    const map = new Map<number, string[]>();
    const push = (id: number, spanId: string) => {
      const arr = map.get(id) ?? [];
      if (!arr.includes(spanId)) arr.push(spanId);
      map.set(id, arr);
    };
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      // Annotations on this step — already measured separately via
      // wb-math's internal annRects path, no need to re-add here.
      const inc = step.incomingArrow;
      if (inc) {
        if (inc.toSpanId) push(step.id, inc.toSpanId);
        // fromSpanId lives on the previous teaching step. Walk backward
        // through the steps array to find the nearest write_math step.
        for (let j = i - 1; j >= 0; j--) {
          if (steps[j].action.type === "write_math") {
            push(steps[j].id, inc.fromSpanId);
            break;
          }
        }
      }
      // Fly-in substitution: each pair needs its toSpan measured on
      // THIS step (target landing position) and its fromSrcSpanId
      // measured on a PREVIOUS write_math step (where the value lives
      // and takes off from). When fromSrcSpanId is omitted it's derived
      // from fromSpan as `src-<key>`.
      const fly = step.flyInSubstitution;
      if (fly) {
        for (const pair of fly.pairs) {
          push(step.id, pair.toSpan);
          const srcId = pair.fromSrcSpanId ?? `src-${pair.fromSpan.replace(/^var-/, "")}`;
          for (let j = i - 1; j >= 0; j--) {
            if (steps[j].action.type === "write_math") {
              push(steps[j].id, srcId);
              break;
            }
          }
        }
      }
    }
    return map;
  }, [steps]);

  // Per-step alignOffsetX: any contiguous run of visible centered
  // write_math steps that ARE WORKED-SOLVE TRIPLET MEMBERS (carry a
  // triplet `phase` of apply / collapse / state) forms an alignment
  // group. Within each chain, shift every member so its `=` lands on
  // the chain's anchor center-x. The chain is broken by:
  //   - Non-write_math content (coord planes, geometry, tables, etc.)
  //   - Non-centered write_math (indented setup / identify rows)
  //   - write_math without a triplet phase: standalone equations
  //     (form intros, identifications, isolated `let m = 2` rows)
  //     often carry `=` and look centered, but they aren't a worked
  //     derivation — chaining them pulls the layout sideways for no
  //     pedagogical gain. Only triplet steps participate.
  //   - Operations that mark a section boundary or a labeling row
  //     rather than a derivation step (CHAIN_BREAKING_OPS), kept as
  //     a defense-in-depth check in case a future step type acquires
  //     a phase but should still break.
  // Steps without an `=` (no measured eqCenter) skip without breaking.
  const alignOffsets = useMemo(() => {
    const out = new Map<number, number>();
    const chains: Array<Array<{ id: number; cx: number }>> = [];
    let current: Array<{ id: number; cx: number }> = [];
    const flush = () => {
      if (current.length) {
        chains.push(current);
        current = [];
      }
    };
    for (const step of steps) {
      if (!visibleStepIds.has(step.id)) continue;
      if (hiddenStepIds.has(step.id)) continue;
      // Zero-height "transparent" actions (highlight, erase, clear) sit
      // between rows without occupying layout space — skip them so the
      // write_math steps on either side stay in the same chain.
      if (CHAIN_TRANSPARENT_ACTIONS.has(step.action.type)) {
        continue;
      }
      if (step.action.type !== "write_math") {
        flush();
        continue;
      }
      if (step.operation && CHAIN_BREAKING_OPS.has(step.operation)) {
        flush();
        continue;
      }
      // Require a triplet phase. Non-triplet write_math is not part of
      // a worked solve and shouldn't be pulled into the equals column.
      if (!step.phase) {
        flush();
        continue;
      }
      const align = (step.action as { align?: string }).align;
      if (align !== "center") {
        flush();
        continue;
      }
      const cx = eqCenters.get(step.id);
      if (cx == null) continue;
      current.push({ id: step.id, cx });
    }
    flush();
    // Anchor each chain to its FIRST member's `=` — the lead
    // equation establishes the column; subsequent steps align to it,
    // so as new steps stream in the earlier steps never shift.
    for (const members of chains) {
      if (members.length < 2) continue;
      const anchor = members[0].cx;
      for (const m of members) {
        const shift = anchor - m.cx;
        if (Math.abs(shift) > 0.5) out.set(m.id, shift);
      }
    }
    return out;
  }, [steps, visibleStepIds, eqCenters, hiddenStepIds]);

  // Callback for wb-math to report measured height. Accepts multiple
  // updates per step — collapse steps that morph to a shorter simplified
  // equation re-report after the swap, and we need the layout to honor
  // the smaller height. Without this, each morph leaves phantom vertical
  // space in the SVG viewBox and the auto-scroll target drifts further
  // past the actual content on every subsequent step.
  //
  // The 10px tolerance + 5-update cap together prevent re-layout loops:
  // small oscillations (sub-pixel scrollHeight jitter) are ignored; and
  // in the pathological case where heights DO legitimately keep
  // changing, we stop updating after a few attempts so layout stabilizes.
  const handleMeasure = useCallback((stepId: number, height: number) => {
    const count = (measurementCounts.current.get(stepId) ?? 0) + 1;
    measurementCounts.current.set(stepId, count);
    if (count > MAX_MEASURE_UPDATES) return;
    setMeasuredHeights((prev) => {
      const existing = prev.get(stepId);
      if (existing !== undefined && Math.abs(existing - height) <= HEIGHT_TOLERANCE_PX) return prev;
      const next = new Map(prev);
      next.set(stepId, height);
      return next;
    });
  }, []);

  // Reset measurement counts when the step set changes (e.g. new lesson)
  useEffect(() => {
    measurementCounts.current = new Map<number, number>();
  }, [steps.length]);

  // Rubber-band drag: document-level move/up so drag works outside SVG bounds
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const pos = clientToSVG(e.clientX, e.clientY);
      if (!pos) return;
      const dx = pos.x - dragStartRef.current.svgX;
      const dy = pos.y - dragStartRef.current.svgY;
      if (!isDraggingRef.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        isDraggingRef.current = true;
      }
      if (isDraggingRef.current) {
        setDragRect({ x1: dragStartRef.current.svgX, y1: dragStartRef.current.svgY, x2: pos.x, y2: pos.y });
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const start = dragStartRef.current;
      dragStartRef.current = null;
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      justDraggedRef.current = true;
      setTimeout(() => { justDraggedRef.current = false; }, 0);
      setDragRect(null);

      if (!onElementsSelect) return;
      const pos = clientToSVG(e.clientX, e.clientY);
      if (!pos) return;
      const selRect: SVGRect = {
        x: Math.min(start.svgX, pos.x),
        y: Math.min(start.svgY, pos.y),
        width: Math.abs(pos.x - start.svgX),
        height: Math.abs(pos.y - start.svgY),
      };
      const matched: SelectedElement[] = [];
      for (const step of steps) {
        if (!visibleStepIds.has(step.id)) continue;
        if (step.action.type !== "write_text" && step.action.type !== "write_math") continue;
        const l = layoutMap.get(step.id);
        if (!l) continue;
        if (rectsIntersect(selRect, { x: l.x - 6, y: l.y - 4, width: l.width + 12, height: l.height + 8 })) {
          const content = step.action.type === "write_math" ? step.action.latex : step.action.text;
          matched.push({ stepId: step.id, type: step.action.type, content });
        }
      }
      if (matched.length > 0) onElementsSelect(matched);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [clientToSVG, steps, visibleStepIds, layoutMap, onElementsSelect]);

  // Track whether user is "following" (near bottom) via scroll events.
  // This captures the state BEFORE new content grows the SVG, so large
  // height jumps (e.g. coordinate planes) don't break the near-bottom check.
  // Also track as state so we can show / hide the "See latest" button —
  // ref alone wouldn't trigger a re-render on scroll.
  const isFollowing = useRef(true);
  const [showLatestButton, setShowLatestButton] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      // Measure distance from the bottom of the CONTENT, not the orb padding.
      const distance = el.scrollHeight - orbScrollPad - el.scrollTop - el.clientHeight;
      isFollowing.current = distance < FOLLOWING_THRESHOLD_PX;
      // Larger threshold for the button so it appears once the user
      // has clearly scrolled away, not the moment they nudge up.
      setShowLatestButton(distance >= SEE_LATEST_THRESHOLD_PX);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  // Compute distribution-arrow endpoints for visible distribute APPLY
  // steps. Inferred entirely from the existing data: step.operation
  // and step.phase locate the apply step; the prior visible
  // write_math step holds the multiplier in a `.dist-src` span; this
  // step's `.op-new` spans are the distribution targets. No schema
  // change — just renderer logic + the agent tagging the multiplier
  // on the prior step. Endpoints are stored in SVG user-unit space
  // so the arrow render is just a path.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const raf = requestAnimationFrame(() => {
      const next = new Map<number, DistArrows>();
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (step.operation !== "distribute" || step.phase !== "apply") continue;
        if (!visibleStepIds.has(step.id)) continue;
        // Prior visible write_math step.
        let srcStep: WhiteboardStep | undefined;
        for (let j = i - 1; j >= 0; j--) {
          const s = steps[j];
          if (visibleStepIds.has(s.id) && s.action.type === "write_math") {
            srcStep = s;
            break;
          }
        }
        if (!srcStep) continue;
        if (typeof document === "undefined") continue;
        const srcOverlay = document.querySelector<HTMLElement>(
          `[data-wbstep-overlay="${srcStep.id}"]`,
        );
        const dstOverlay = document.querySelector<HTMLElement>(
          `[data-wbstep-overlay="${step.id}"]`,
        );
        if (!srcOverlay || !dstOverlay) continue;
        const srcEl = srcOverlay.querySelector<HTMLElement>(".dist-src");
        if (!srcEl) continue;
        const dstEls = Array.from(
          dstOverlay.querySelectorAll<HTMLElement>(".op-new"),
        );
        if (dstEls.length === 0) continue;
        const srcRect = clientRectToSVG(srcEl.getBoundingClientRect(), svg);
        if (!srcRect) continue;
        const targets: { x: number; y: number }[] = [];
        for (const el of dstEls) {
          const r = clientRectToSVG(el.getBoundingClientRect(), svg);
          if (!r) continue;
          targets.push({ x: r.x + r.width / 2, y: r.y });
        }
        if (targets.length === 0) continue;
        next.set(step.id, {
          src: { x: srcRect.x + srcRect.width / 2, y: srcRect.y + srcRect.height },
          targets,
        });
      }
      setDistributionArrows((prev) => {
        if (prev.size === 0 && next.size === 0) return prev;
        // Shallow-equal check on size + per-key endpoints to avoid
        // setState loops when the layout is stable.
        if (prev.size === next.size) {
          let changed = false;
          for (const [k, v] of next) {
            const p = prev.get(k);
            if (
              !p ||
              p.targets.length !== v.targets.length ||
              Math.abs(p.src.x - v.src.x) > 0.5 ||
              Math.abs(p.src.y - v.src.y) > 0.5
            ) {
              changed = true;
              break;
            }
            for (let i = 0; i < v.targets.length; i++) {
              if (
                Math.abs(p.targets[i].x - v.targets[i].x) > 0.5 ||
                Math.abs(p.targets[i].y - v.targets[i].y) > 0.5
              ) {
                changed = true;
                break;
              }
            }
            if (changed) break;
          }
          if (!changed) return prev;
        }
        return next;
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [steps, visibleStepIds, measuredHeights, spanRects, renderedWidth]);

  // Auto-scroll so the latest element's bottom edge sits at the viewport
  // bottom. Re-fires on BOTH new-step arrivals AND height growth of the
  // already-visible steps — the latter matters for math with \frac where
  // the initial 70px height estimate is smaller than the measured height,
  // so the board grows after the step was first rendered.
  //
  // Shrinkage path: when a check_in / predict / fill_blank fires (or any
  // explicit clear/erase action), `buildVisibleIds` drops prior steps
  // and the canvas swaps to a shorter scene. Without a counter-scroll
  // the user is left looking at the bottom of the previous content —
  // empty space below whatever short scene just appeared. Detect the
  // shrink and snap the scrollTop back to 0 so the new content starts
  // at the top of the viewport.
  //
  // Triggering only off a REAL-step visible-set drop. Sentinel-id
  // overlays (interactionVisualStep id=-1, answerCallout id=-6, hint
  // callout sentinels) get added/removed as the lesson cycles into
  // and out of an interaction. Their removal during the post-answer
  // advance was previously triggering scroll-to-top, even though the
  // underlying accumulated lesson content was unchanged. Counting
  // only positive ids isolates "the scene itself reset" from
  // "interaction overlay dismissed" — the former wants a snap-to-top
  // (worked-example transition, explicit clear), the latter doesn't.
  const prevVisibleCount = useRef(0);
  const prevRealStepCount = useRef(0);
  const prevViewBoxHeight = useRef(0);
  // Snapshot of the prior visible set so a shrink can be classified. A
  // backward seek (transport ◀ / scrubber) drops the TAIL of the
  // accumulated prefix — every remaining real id was already visible —
  // whereas a section reset (check_in boundary, explicit clear) swaps in
  // a FRESH scene with ids we weren't showing. Only the latter snaps to
  // top; the former pins the step the student navigated back to.
  const prevVisibleIds = useRef<Set<number>>(new Set());
  // Last `resumeFollowNonce` acted on. A change means the parent wants
  // following re-armed + a pin to latest (interaction answered, transport
  // pressed) — see the prop doc.
  const prevResumeNonce = useRef(resumeFollowNonce);
  useEffect(() => {
    const visibleCount = visibleStepIds.size;
    let realStepCount = 0;
    for (const id of visibleStepIds) {
      if (id >= 0) realStepCount++;
    }
    const newStepArrived = visibleCount > prevVisibleCount.current;
    // Trigger catch-up scroll on ANY measurable growth — small
    // post-morph height re-measurements (1-2 units) used to fall
    // under a 4-unit threshold, leaving the latest equation cut off
    // at the viewport bottom.
    const boardGrew = viewBoxHeight > prevViewBoxHeight.current + 0.5;
    // Canvas reset: a real interaction-driven scene swap drops the
    // count of REAL (positive-id) steps. Sentinel removals (negative
    // ids leaving) leave the real-step count unchanged → no snap.
    const canvasShrank = realStepCount < prevRealStepCount.current;

    // Deliberate "show me the latest" signal from the parent. Re-arm
    // following so a stale isFollowing=false (scrolled up to read a
    // question, or the question panel having shrunk the viewport) can't
    // strand the student when the lesson resumes below the fold.
    const resumed = resumeFollowNonce !== prevResumeNonce.current;
    prevResumeNonce.current = resumeFollowNonce;
    if (resumed) isFollowing.current = true;

    // Classify a shrink: a fresh-scene reset introduces real ids we
    // weren't showing; a backward seek leaves only ids that were already
    // visible (the accumulated prefix minus its tail).
    let shrankToFreshScene = false;
    if (canvasShrank) {
      for (const id of visibleStepIds) {
        if (id >= 0 && !prevVisibleIds.current.has(id)) {
          shrankToFreshScene = true;
          break;
        }
      }
    }
    const backwardSeek = canvasShrank && !shrankToFreshScene;

    const commitPrev = () => {
      prevVisibleCount.current = visibleCount;
      prevRealStepCount.current = realStepCount;
      prevViewBoxHeight.current = viewBoxHeight;
      prevVisibleIds.current = new Set(visibleStepIds);
    };

    if (canvasShrank && shrankToFreshScene && scrollRef.current) {
      // Snap rather than smooth — the old content is gone, smooth-
      // scrolling through empty space reads as a glitch. We also
      // ignore `isFollowing` here because shrinkage is an explicit
      // canvas reset, not a "tail-along with new content" follow.
      scrollRef.current.scrollTo({ top: 0, behavior: "auto" });
      isFollowing.current = true;
      commitPrev();
      return;
    }

    // A backward seek is a deliberate navigation — always reveal the
    // target step, even if the student had scrolled away.
    if (backwardSeek) isFollowing.current = true;

    if ((newStepArrived || boardGrew || resumed || backwardSeek) && scrollRef.current && isFollowing.current) {
      const el = scrollRef.current;
      requestAnimationFrame(() => {
        let maxBottom = 0;
        for (const r of layout) {
          const bottom = r.y + r.height;
          if (bottom > maxBottom) maxBottom = bottom;
        }
        // Buffer below latest content. Larger buffer (was 24) so the
        // latest equation has clear breathing room above the viewport
        // bottom and is never visually clipped, even if a late
        // post-morph re-measure grows the row by a few px after the
        // smooth-scroll completed.
        maxBottom += 48;

        if (viewBoxHeight > 0) {
          // Convert content-space position to px using the CONTENT height
          // (scrollHeight minus the orb padding), else the follow over-scrolls.
          const pixelBottom = (maxBottom / viewBoxHeight) * (el.scrollHeight - orbScrollPad);
          // Orb mode: leave a fixed px gap below the latest content so the orb
          // (when it floats below the step) and its side caption stay visible.
          // Bounded by orbScrollPad, so it never scrolls past the real bottom.
          const orbRoom = sequentialDiagrams ? 130 : 0;
          const targetScroll = Math.max(0, pixelBottom + orbRoom - el.clientHeight);
          // Smooth for tail-along growth (post-morph re-measurements,
          // late-arriving \frac heights) so the scroll tracks the
          // animated SVG height transition. Snap for a backward seek —
          // it's a scene jump, and smooth-scrolling the (often large)
          // distance reads as a glitch.
          el.scrollTo({ top: targetScroll, behavior: backwardSeek ? "auto" : "smooth" });
        }
      });
    }
    commitPrev();
  }, [visibleStepIds, viewBoxHeight, layout, resumeFollowNonce]);


  return (
    <div className="relative h-full w-full">
    <div
      ref={scrollRef}
      className="h-full w-full overflow-y-auto overflow-x-hidden"
      style={{
        background: "var(--wb-canvas)",
        // Orb mode: room below the last step so the orb (and its caption) stay
        // visible when the orb floats below the content. (The scroll math above
        // subtracts orbScrollPad so this doesn't skew the auto-follow.)
        paddingBottom: orbScrollPad || undefined,
      }}
    >
      {/* Stack: SVG (graphics: planes, lines, arrows, decorations) at
          the bottom layer, an HTML overlay (math equations) absolutely
          on top. They share a relative parent of the SVG's exact
          rendered pixel size. Equations render as standard <div>s
          (not <foreignObject>) to avoid Safari's foreignObject paint-
          drift bug. Coords from layout-engine are in 1000-unit space;
          the overlay multiplies by canvasScale to map them to the
          viewport-pixel coordinate system the HTML overlays live in. */}
      <div
        style={{
          position: "relative",
          width: renderedWidth || contentWidth,
          height: renderedWidth ? Math.round((renderedWidth * viewBoxHeight) / contentWidth) : viewBoxHeight,
          margin: "0 auto",
        }}
      >
      <svg
        ref={svgRef}
        // Use SVG viewBox-based scaling (1000-unit content space) rather
        // than wrapping content in `<g transform="scale">`. WebKit has a
        // paint-position bug: when a foreignObject has a `<g transform>`
        // ancestor, the foreignObject's BCR reflects the transform but
        // its HTML content paints at the *untransformed* y, drifting
        // upward by `(scale - 1) * y` viewport pixels — equations end up
        // visually overlapping the row above. SVG-native viewBox
        // scaling avoids the bug because it doesn't go through the
        // transform pipeline. Same final pixel size on screen.
        viewBox={`0 0 ${contentWidth} ${viewBoxHeight}`}
        width={renderedWidth || contentWidth}
        height={renderedWidth ? Math.round((renderedWidth * viewBoxHeight) / contentWidth) : viewBoxHeight}
        preserveAspectRatio="xMidYMin meet"
        shapeRendering="geometricPrecision"
        style={{
          display: "block",
          // The relative parent now handles horizontal centering.
          // `vertical-align: top` defends against webkit's default
          // baseline alignment for inline-level SVG.
          verticalAlign: "top",
          userSelect: "none",
        }}
        onMouseDown={handleSVGMouseDown}
        onClick={() => { if (justDraggedRef.current) return; onElementSelect?.(null); }}
      >
      {/* Layout coords from the layout-engine are in a 1000-unit
          board-width space — the SVG viewBox above is also 1000 units
          wide, so content renders in the layout's native coordinate
          system with the SVG natively scaling to the rendered pixel
          width. No inner transform needed (and crucially, none should
          be added — see WebKit foreignObject paint-drift note above). */}
      <g>

        {/* Cross-step incomingArrow curves. Renders a cubic
            bezier from a named span in the source step down to a named
            span (or op-new / step center fallback) in the target step. */}
        {steps.map((step, idx) => {
          if (!visibleStepIds.has(step.id)) return null;
          const inc = step.incomingArrow;
          if (!inc) return null;
          const l = layoutMap.get(step.id);
          if (!l || l.height === 0) return null;

          // Nearest preceding visible write_math step is the source.
          let srcStep: WhiteboardStep | undefined;
          for (let j = idx - 1; j >= 0; j--) {
            const s = steps[j];
            if (visibleStepIds.has(s.id) && s.action.type === "write_math") {
              srcStep = s;
              break;
            }
          }
          if (!srcStep) return null;
          const srcLayout = layoutMap.get(srcStep.id);
          if (!srcLayout) return null;

          const srcRect = spanRects.get(srcStep.id)?.[inc.fromSpanId];
          if (!srcRect) return null;
          const dstRect = inc.toSpanId
            ? spanRects.get(step.id)?.[inc.toSpanId]
            : undefined;

          const srcAlign = alignOffsets.get(srcStep.id) ?? 0;
          const dstAlign = alignOffsets.get(step.id) ?? 0;
          const dstLocalTarget = dstRect?.centerX ?? opNewCenters.get(step.id);

          const x1 = srcLayout.x + srcRect.centerX + srcAlign;
          const y1 = srcLayout.y + srcRect.bottom + 2;
          const x2 =
            dstLocalTarget != null
              ? l.x + dstLocalTarget + dstAlign
              : l.x + l.width / 2;
          const y2 = (dstRect ? l.y + dstRect.top : l.y) - 3;

          const stroke = inc.color ?? "oklch(0.72 0.14 275 / 0.7)";
          const dx = x2 - x1;
          const dy = Math.max(30, y2 - y1);
          // S-curve: bend outward horizontally so the arrow reads as
          // "traveling" between spans rather than a straight line.
          const c1x = x1 + dx * 0.15;
          const c1y = y1 + dy * 0.55;
          const c2x = x2 - dx * 0.15;
          const c2y = y2 - dy * 0.35;
          const d = `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;

          // Arrowhead: triangle oriented along tangent at end point.
          const tangentDx = x2 - c2x;
          const tangentDy = y2 - c2y;
          const tlen = Math.hypot(tangentDx, tangentDy) || 1;
          const ux = tangentDx / tlen;
          const uy = tangentDy / tlen;
          const nx = -uy;
          const ny = ux;
          const headLen = 8;
          const headHalf = 4;
          const baseX = x2 - ux * headLen;
          const baseY = y2 - uy * headLen;
          const leftX = baseX + nx * headHalf;
          const leftY = baseY + ny * headHalf;
          const rightX = baseX - nx * headHalf;
          const rightY = baseY - ny * headHalf;

          return (
            <g key={`xarrow-${step.id}`} className="wb-connector wb-connector-cross">
              <path
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={1.25}
                opacity={0.9}
              />
              <polygon
                points={`${leftX},${leftY} ${rightX},${rightY} ${x2},${y2}`}
                fill={stroke}
                opacity={0.9}
              />
            </g>
          );
        })}

        {/* Distribution arrows — for each visible distribute APPLY
            step, fan out one curved cubic-bezier from the prior step's
            multiplier (a `.dist-src` span) to each `.op-new` span on
            this step. Endpoints are computed in the useEffect above
            and stored in distributionArrows; this is just the render. */}
        {Array.from(distributionArrows.entries()).map(([stepId, arrows]) => {
          // Match the whiteboard's monochrome equation palette — the
          // arrows render in the canvas foreground color, same as
          // every KaTeX glyph inside `[data-wbstep-overlay]`.
          const stroke = "var(--obs-fg)";
          const headLen = 8;
          const headHalf = 4;
          return (
            <g key={`dist-${stepId}`} className="wb-connector wb-connector-distribute">
              {arrows.targets.map((t, i) => {
                const x1 = arrows.src.x;
                const y1 = arrows.src.y + 2;
                const x2 = t.x;
                const y2 = t.y - 3;
                const dx = x2 - x1;
                const dy = Math.max(20, y2 - y1);
                // Splay control points so multi-target arcs separate
                // visually instead of overlapping into a single curve.
                const fan = (i - (arrows.targets.length - 1) / 2) * 16;
                const c1x = x1 + dx * 0.2 + fan;
                const c1y = y1 + dy * 0.55;
                const c2x = x2 - dx * 0.15;
                const c2y = y2 - dy * 0.35;
                const d = `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
                const tdx = x2 - c2x;
                const tdy = y2 - c2y;
                const tlen = Math.hypot(tdx, tdy) || 1;
                const ux = tdx / tlen;
                const uy = tdy / tlen;
                const nx = -uy;
                const ny = ux;
                const baseX = x2 - ux * headLen;
                const baseY = y2 - uy * headLen;
                const leftX = baseX + nx * headHalf;
                const leftY = baseY + ny * headHalf;
                const rightX = baseX - nx * headHalf;
                const rightY = baseY - ny * headHalf;
                return (
                  <g key={`dist-${stepId}-${i}`}>
                    {/* pathLength=100 normalizes the dash math so the
                        stroke-dasharray/offset values in globals.css
                        ("100" / "100" → "0") draw the path from start
                        to end regardless of the actual curve length. */}
                    <path
                      d={d}
                      pathLength={100}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={1.75}
                      opacity={0.9}
                      className="wb-dist-path"
                    />
                    {/* The .wb-dist-head class drives opacity 0→0.9
                        with a delayed pop after the stroke draw
                        completes; no inline opacity here so the
                        initial state is invisible until CSS kicks in. */}
                    <polygon
                      points={`${leftX},${leftY} ${rightX},${rightY} ${x2},${y2}`}
                      fill={stroke}
                      className="wb-dist-head"
                    />
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Layer 1: Highlights */}
        {steps.map((step, idx) => {
          if (!visibleStepIds.has(step.id)) return null;
          if (step.action.type !== "highlight") return null;
          const isCurrentStep = idx === currentStepIndex;
          const progress = isCurrentStep ? stepProgress : 1;

          /** Render a highlight rect sized to the targeted equation's
           *  measured bounding box (the FINAL post-morph rendered
           *  width + center). Falls back to a centered cap-width
           *  rect if the bbox hasn't been measured yet (first paint
           *  / non-write_math target). Width is capped so the rect
           *  reads as a callout, not a banner. */
          const renderTight = (targetLayout: { x: number; y: number; width: number; height: number }, targetId: number) => {
            // Tight bounds: hug the rendered katex bbox with minimal
            // padding. No row-width fallback — without a measured
            // bbox we don't render anything, since the whole point of
            // the highlight is to wrap the equation tightly.
            const bbox = eqBBoxes.get(targetId);
            if (!bbox) return null;
            const HL_PAD_X = 4;
            const HL_PAD_Y = 2;
            const w = bbox.width + HL_PAD_X * 2;
            // bbox.centerX is wrapper-local (the foreignObject sits at
            // targetLayout.x in SVG space, so add the layout offset).
            // bbox is measured at left:0; the displayed equation also
            // shifts by alignOffsets[targetId] for chain alignment, so
            // the highlight has to follow that shift to stay over the
            // visible equation.
            const chainShift = alignOffsets.get(targetId) ?? 0;
            const svgCx = targetLayout.x + bbox.centerX + chainShift;
            const x = svgCx - w / 2;
            return (
              <g key={`hl-${step.id}`}>
                <WbHighlight
                  x={x}
                  y={targetLayout.y - HL_PAD_Y}
                  width={w}
                  height={targetLayout.height + HL_PAD_Y * 2}
                  color={(step.action as { color: string }).color}
                  progress={progress}
                />
              </g>
            );
          };

          // New: targetStepIndex-based highlight
          if (step.action.targetStepIndex != null) {
            const targetLayout = getStepLayoutByIndex(layout, steps, step.action.targetStepIndex);
            if (!targetLayout) return null;
            // Skip highlight overlays on coordinate planes — the
            // amber wash covers the plot itself, hiding the very
            // thing the highlight is supposed to draw attention to.
            const target = steps[step.action.targetStepIndex];
            if (target?.action.type === "coordinate_plane") return null;
            return renderTight(targetLayout, target.id);
          }

          // Legacy: region-based highlight with backward compat
          if (step.action.region) {
            const region = step.action.region;
            return (
              <g key={`hl-${step.id}`}>
                <WbHighlight
                  x={(region.position.x / 100) * contentWidth}
                  y={(region.position.y / 100) * 600}
                  width={(region.width / 100) * contentWidth}
                  height={80}
                  color={step.action.color}
                  progress={progress}
                />
              </g>
            );
          }

          // Legacy: targetStepId
          if (step.action.targetStepId != null) {
            const targetStepId = step.action.targetStepId;
            const targetLayout = getStepLayout(layout, targetStepId);
            if (!targetLayout) return null;
            // Same coord-plane suppression as the index-based branch.
            const target = steps.find((s) => s.id === targetStepId);
            if (target?.action.type === "coordinate_plane") return null;
            return renderTight(targetLayout, targetStepId);
          }

          return null;
        })}

        {/* Layer 2: Shapes */}
        {steps.map((step, idx) => {
          if (!visibleStepIds.has(step.id)) return null;
          if (step.action.type !== "draw_shape") return null;
          const isCurrentStep = idx === currentStepIndex;
          const progress = isCurrentStep ? stepProgress : 1;
          const l = layoutMap.get(step.id);
          if (!l) return null;
          return (
            <g key={`sh-${step.id}`}>
              <WbShape
                shape={step.action.shape}
                points={step.action.points}
                x={l.x}
                y={l.y}
                width={l.width}
                height={l.height}
                style={step.action.style}
                progress={progress}
                isAnimating={isCurrentStep && stepProgress < 1}
              />
            </g>
          );
        })}

        {/* Layer 3: Text and Math */}
        {steps.map((step, idx) => {
          if (!visibleStepIds.has(step.id)) return null;
          const { action } = step;
          if (action.type !== "write_text" && action.type !== "write_math") return null;
          const isCurrentStep = idx === currentStepIndex;
          const progress = isCurrentStep ? stepProgress : 1;
          const l = layoutMap.get(step.id);
          if (!l) return null;

          if (action.type === "write_text") {
            // Steps that mix prose with inline `$...$` math render through
            // the HTML overlay below (KaTeX-aware) — SVG <text> can't draw
            // math. Plain prose stays on this SVG path unchanged.
            if (hasInlineMath(action.text)) return null;
            const isHovered = !!(onElementSelect && hoveredStepId === step.id);
            const stepSels = selections.filter(s => s.stepId === step.id);
            const isSelected = stepSels.length > 0;

            const handleTextClick = (e: React.MouseEvent<SVGGElement>) => {
              e.stopPropagation();
              if (!onElementSelect) return;
              const svg = (e.currentTarget as SVGGElement).ownerSVGElement;
              let el: SelectedElement;
              let rect: SVGRect | null = null;
              if (e.target instanceof SVGTSpanElement) {
                const word = (e.target.textContent ?? "").replace(/^\s+|\s+$/, "").trim();
                if (word && word !== action.text) {
                  el = { stepId: step.id, type: "write_text", content: word, isTerm: true };
                  if (svg) rect = clientRectToSVG(e.target.getBoundingClientRect(), svg);
                } else {
                  el = { stepId: step.id, type: "write_text", content: action.text };
                }
              } else {
                el = { stepId: step.id, type: "write_text", content: action.text };
              }
              const key = selKey(el);
              if ((e.metaKey || e.ctrlKey) && onElementToggle) {
                const alreadyIn = selections.some(s => selKey(s) === key);
                setSelectionRects(prev => {
                  const m = new Map(prev);
                  if (alreadyIn) m.delete(key); else if (rect) m.set(key, rect);
                  return m;
                });
                onElementToggle(el);
              } else {
                setSelectionRects(rect ? new Map([[key, rect]]) : new Map());
                onElementSelect(el);
              }
            };

            return (
              <g
                key={`txt-${step.id}`}
                data-wbstep={step.id}
                style={{ cursor: onElementSelect ? "pointer" : "default" }}
                onMouseEnter={() => onElementSelect && setHoveredStepId(step.id)}
                onMouseLeave={() => setHoveredStepId(null)}
                onClick={handleTextClick}
              >
                {isHovered && !isSelected && (
                  <rect x={l.x - 6} y={l.y - 4} width={l.width + 12} height={l.height + 8} rx={4}
                    style={{ fill: "var(--wb-hover-fill)", stroke: "var(--wb-hover-stroke)" }} fillOpacity={0.6} strokeWidth={1.5} strokeDasharray="4 3" />
                )}
                {stepSels.map(sel => {
                  const r = selectionRects.get(selKey(sel));
                  return (
                    <rect key={selKey(sel)}
                      x={r ? r.x : l.x - 6} y={r ? r.y : l.y - 4}
                      width={r ? r.width : l.width + 12} height={r ? r.height : l.height + 8}
                      rx={4} fill="none" style={{ stroke: "var(--athena-amber)" }} strokeWidth={2} />
                  );
                })}
                <WbText
                  text={action.text}
                  x={l.x} y={l.y} width={l.width} height={l.height}
                  style={action.style} reveal={action.reveal}
                  progress={progress} isAnimating={isCurrentStep && stepProgress < 1}
                />
                <rect x={l.x - 6} y={l.y - 4} width={l.width + 12} height={l.height + 8}
                  fill="rgba(0,0,0,0)" pointerEvents="all" />
              </g>
            );
          }

          if (action.type === "write_math") {
            // Hidden state steps: the preceding collapse step has already
            // morphed in place to this step's simplified latex, so rendering
            // it again on the board would duplicate the same equation.
            if (hiddenStepIds.has(step.id)) return null;
            const isHovered = !!(onElementSelect && hoveredStepId === step.id);
            const stepSels = selections.filter(s => s.stepId === step.id);
            const isSelected = stepSels.length > 0;

            const handleMathClick = (e: React.MouseEvent<SVGGElement>) => {
              e.stopPropagation();
              if (!onElementSelect) return;
              const svg = (e.currentTarget as SVGGElement).ownerSVGElement;
              let el: SelectedElement;
              let rect: SVGRect | null = null;
              if (e.target instanceof HTMLElement) {
                const { text, els } = findMathSelection(e.target);
                const isTerm = text.length > 0 && text !== action.latex;
                el = { stepId: step.id, type: "write_math", content: text || action.latex, isTerm };
                if (svg && els.length > 0) {
                  const domRects = els.map(e => e.getBoundingClientRect());
                  const union = {
                    left: Math.min(...domRects.map(r => r.left)),
                    top: Math.min(...domRects.map(r => r.top)),
                    right: Math.max(...domRects.map(r => r.right)),
                    bottom: Math.max(...domRects.map(r => r.bottom)),
                  };
                  rect = clientRectToSVG(union, svg);
                }
              } else {
                el = { stepId: step.id, type: "write_math", content: action.latex };
              }
              const key = selKey(el);
              if ((e.metaKey || e.ctrlKey) && onElementToggle) {
                const alreadyIn = selections.some(s => selKey(s) === key);
                setSelectionRects(prev => {
                  const m = new Map(prev);
                  if (alreadyIn) m.delete(key); else if (rect) m.set(key, rect);
                  return m;
                });
                onElementToggle(el);
              } else {
                setSelectionRects(rect ? new Map([[key, rect]]) : new Map());
                onElementSelect(el);
              }
            };

            return (
              <g
                key={`math-${step.id}`}
                data-wbstep={step.id}
                style={{ cursor: onElementSelect ? "pointer" : "default" }}
                onMouseEnter={() => onElementSelect && setHoveredStepId(step.id)}
                onMouseLeave={() => setHoveredStepId(null)}
                onClick={handleMathClick}
              >
                {isHovered && !isSelected && (
                  <rect x={l.x - 6} y={l.y - 4} width={l.width + 12} height={l.height + 8} rx={4}
                    style={{ fill: "var(--wb-hover-fill)", stroke: "var(--wb-hover-stroke)" }} fillOpacity={0.6} strokeWidth={1.5} strokeDasharray="4 3" />
                )}
                {stepSels.map(sel => {
                  const r = selectionRects.get(selKey(sel));
                  return (
                    <rect key={selKey(sel)}
                      x={r ? r.x : l.x - 6} y={r ? r.y : l.y - 4}
                      width={r ? r.width : l.width + 12} height={r ? r.height : l.height + 8}
                      rx={4} fill="none" style={{ stroke: "var(--athena-amber)" }} strokeWidth={2} />
                  );
                })}
                {/* Hit-target rect: catches clicks in the row's
                    decorative padding area (around the equation
                    extents). The actual equation is rendered in the
                    HTML overlay above the SVG and intercepts its own
                    clicks. */}
                <rect x={l.x - 6} y={l.y - 4} width={l.width + 12} height={l.height + 8}
                  fill="rgba(0,0,0,0)" pointerEvents="all" />
              </g>
            );
          }

          return null;
        })}

        {/* Layer 4: Rich visualizations */}
        {steps.map((step, idx) => {
          if (!visibleStepIds.has(step.id)) return null;
          const { action } = step;
          const l = layoutMap.get(step.id);
          if (!l) return null;
          const isCurrentStep = idx === currentStepIndex;
          const progress = isCurrentStep ? stepProgress : 1;
          const animating = isCurrentStep && stepProgress < 1;

          switch (action.type) {
            case "coordinate_plane":
              return (
                <g key={`cp-${step.id}`}>
                  <WbCoordinatePlane
                    action={action}
                    x={l.x}
                    y={l.y}
                    width={l.width}
                    height={l.height}
                    progress={progress}
                    isAnimating={animating}
                    equalScale={equalScaleCoords}
                  />
                </g>
              );
            case "geometry":
              return (
                <g key={`geo-${step.id}`}>
                  <WbGeometry
                    action={action}
                    x={l.x}
                    y={l.y}
                    width={l.width}
                    height={l.height}
                    progress={progress}
                    isAnimating={animating}
                    penDraw={sequentialDiagrams}
                  />
                </g>
              );
            case "number_line":
              return (
                <g key={`nl-${step.id}`}>
                  <WbNumberLine
                    action={action}
                    x={l.x}
                    y={l.y}
                    width={l.width}
                    height={l.height}
                    progress={progress}
                    isAnimating={animating}
                  />
                </g>
              );
            case "table":
              // Rendered via the HTML overlay layer below — bypasses
              // SVG <foreignObject> per the same Safari paint-drift
              // workaround wb-math / wb-callout use. KaTeX-laden cells
              // inside foreignObject also caused getBoundingClientRect
              // jitter that fed the distributionArrows effect into a
              // setState loop during scrubber drags.
              return null;
            case "callout":
              // Rendered via the HTML overlay layer below — bypasses
              // SVG <foreignObject> per the same Safari paint-drift
              // workaround wb-math uses.
              return null;
            default:
              return null;
          }
        })}
        {/* Rubber-band drag selection rect */}
        {dragRect && (
          <rect
            x={Math.min(dragRect.x1, dragRect.x2)}
            y={Math.min(dragRect.y1, dragRect.y2)}
            width={Math.abs(dragRect.x2 - dragRect.x1)}
            height={Math.abs(dragRect.y2 - dragRect.y1)}
            style={{ fill: "var(--wb-hover-fill)", stroke: "var(--athena-amber)" }}
            fillOpacity={0.4}
            strokeWidth={1.5}
            strokeDasharray="5 3"
            pointerEvents="none"
          />
        )}
      </g>
      </svg>
      {/* HTML overlay layer for math equations. Renders as standard
          <div>s positioned in viewport-pixel space — bypasses the
          Safari foreignObject paint-drift bug entirely. The container
          is pointer-events:none so empty space passes clicks through
          to the SVG below; each equation re-enables pointer-events on
          its own wrapper. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
        }}
      >
        {steps.map((step, idx) => {
          if (!visibleStepIds.has(step.id)) return null;
          if (step.action.type !== "write_math") return null;
          if (hiddenStepIds.has(step.id)) return null;
          const action = step.action;
          const l = layoutMap.get(step.id);
          if (!l) return null;
          const isCurrentStep = idx === currentStepIndex;
          const progress = isCurrentStep ? stepProgress : 1;
          const canvasScale = (renderedWidth || contentWidth) / contentWidth;

          const handleMathClick = (e: React.MouseEvent<HTMLDivElement>) => {
            e.stopPropagation();
            if (!onElementSelect) return;
            const svg = svgRef.current;
            let el: SelectedElement;
            let rect: SVGRect | null = null;
            if (e.target instanceof HTMLElement) {
              const { text, els } = findMathSelection(e.target);
              const isTerm = text.length > 0 && text !== action.latex;
              el = { stepId: step.id, type: "write_math", content: text || action.latex, isTerm };
              if (svg && els.length > 0) {
                const domRects = els.map(e => e.getBoundingClientRect());
                const union = {
                  left: Math.min(...domRects.map(r => r.left)),
                  top: Math.min(...domRects.map(r => r.top)),
                  right: Math.max(...domRects.map(r => r.right)),
                  bottom: Math.max(...domRects.map(r => r.bottom)),
                };
                rect = clientRectToSVG(union, svg);
              }
            } else {
              el = { stepId: step.id, type: "write_math", content: action.latex };
            }
            const key = selKey(el);
            if ((e.metaKey || e.ctrlKey) && onElementToggle) {
              const alreadyIn = selections.some(s => selKey(s) === key);
              setSelectionRects(prev => {
                const m = new Map(prev);
                if (alreadyIn) m.delete(key); else if (rect) m.set(key, rect);
                return m;
              });
              onElementToggle(el);
            } else {
              setSelectionRects(rect ? new Map([[key, rect]]) : new Map());
              onElementSelect(el);
            }
          };

          return (
            <div
              key={`math-overlay-${step.id}`}
              data-wbstep-overlay={step.id}
              style={{
                position: "absolute",
                left: l.x * canvasScale,
                top: l.y * canvasScale,
                // Inner div sized in 1000-unit space; the CSS transform
                // below scales it visually to viewport pixels. KaTeX's
                // font sizes are calibrated for the 1000-unit space, so
                // this preserves the same on-screen rendered size as
                // the previous SVG-scaled architecture.
                transform: `scale(${canvasScale})`,
                transformOrigin: "top left",
                pointerEvents: onElementSelect ? "auto" : "none",
                cursor: onElementSelect ? "pointer" : "default",
              }}
              onMouseEnter={() => onElementSelect && setHoveredStepId(step.id)}
              onMouseLeave={() => setHoveredStepId(null)}
              onClick={handleMathClick}
            >
              <WbMath
                latex={action.latex}
                x={0}
                y={0}
                width={l.width}
                height={l.height}
                style={action.style}
                progress={progress}
                isAnimating={isCurrentStep && stepProgress < 1}
                onMeasure={(h) => handleMeasure(step.id, h)}
                operation={step.operation}
                phase={step.phase}
                simplifiedLatex={simplifiedLatexByStepId.get(step.id)}
                substitutionAnimation={step.substitutionAnimation}
                flyInSubstitution={step.flyInSubstitution}
                arrivedPairs={arrivedPairs.get(step.id)}
                fadedVarPairs={fadedPairs.get(step.id)}
                settled={settledSteps.has(step.id)}
                annotations={step.annotations}
                onEqMeasure={(c) => handleEqMeasure(step.id, c)}
                onEqBBoxMeasure={(b) => handleEqBBoxMeasure(step.id, b)}
                onOpNewMeasure={(c) => handleOpNewMeasure(step.id, c)}
                alignOffsetX={alignOffsets.get(step.id)}
                measureSpanIds={spanIdsByStep.get(step.id)}
                onSpanRects={(r) => handleSpanRects(step.id, r)}
              />
            </div>
          );
        })}
        {/* Rich-text overlay — write_text steps that carry inline `$...$`
            math. Same overlay layer pattern as math/callout: canvas-scaled
            HTML so KaTeX never renders inside foreignObject. Plain write_text
            (no math) stays on the SVG path above. */}
        {steps.map((step, idx) => {
          if (!visibleStepIds.has(step.id)) return null;
          if (step.action.type !== "write_text") return null;
          if (!hasInlineMath(step.action.text)) return null;
          if (hiddenStepIds.has(step.id)) return null;
          const action = step.action;
          const l = layoutMap.get(step.id);
          if (!l) return null;
          const isCurrentStep = idx === currentStepIndex;
          const progress = isCurrentStep ? stepProgress : 1;
          const canvasScale = (renderedWidth || contentWidth) / contentWidth;

          const handleRichTextClick = (e: React.MouseEvent<HTMLDivElement>) => {
            if (!onElementSelect) return;
            e.stopPropagation();
            const el: SelectedElement = { stepId: step.id, type: "write_text", content: action.text };
            setSelectionRects(new Map());
            onElementSelect(el);
          };

          return (
            <div
              key={`richtext-overlay-${step.id}`}
              style={{
                position: "absolute",
                left: l.x * canvasScale,
                top: l.y * canvasScale,
                transform: `scale(${canvasScale})`,
                transformOrigin: "top left",
                pointerEvents: onElementSelect ? "auto" : "none",
                cursor: onElementSelect ? "pointer" : "default",
              }}
              onMouseEnter={() => onElementSelect && setHoveredStepId(step.id)}
              onMouseLeave={() => setHoveredStepId(null)}
              onClick={handleRichTextClick}
            >
              <WbRichText
                text={action.text}
                width={l.width}
                style={action.style}
                progress={progress}
                onMeasure={(h) => handleMeasure(step.id, h)}
              />
            </div>
          );
        })}
        {/* Callout overlay — same overlay layer pattern as math; renders
            in canvas-scaled HTML so we never use foreignObject. */}
        {steps.map((step, idx) => {
          if (!visibleStepIds.has(step.id)) return null;
          if (step.action.type !== "callout") return null;
          if (hiddenStepIds.has(step.id)) return null;
          const action = step.action;
          const l = layoutMap.get(step.id);
          if (!l) return null;
          const isCurrentStep = idx === currentStepIndex;
          const progress = isCurrentStep ? stepProgress : 1;
          const canvasScale = (renderedWidth || contentWidth) / contentWidth;
          return (
            <div
              key={`callout-overlay-${step.id}`}
              data-wbstep-overlay={step.id}
              style={{
                position: "absolute",
                left: l.x * canvasScale,
                top: l.y * canvasScale,
                transform: `scale(${canvasScale})`,
                transformOrigin: "top left",
                pointerEvents: "none",
              }}
            >
              <WbCallout
                action={action}
                width={l.width}
                progress={progress}
                isAnimating={isCurrentStep && stepProgress < 1}
                onMeasure={(h) => handleMeasure(step.id, h)}
              />
            </div>
          );
        })}

        {/* Image overlay — same HTML-overlay pattern (sibling to SVG, never
            foreignObject). Raw <img>; real height comes back via onMeasure on load. */}
        {steps.map((step, idx) => {
          if (!visibleStepIds.has(step.id)) return null;
          if (step.action.type !== "image") return null;
          if (hiddenStepIds.has(step.id)) return null;
          const action = step.action;
          const l = layoutMap.get(step.id);
          if (!l) return null;
          const isCurrentStep = idx === currentStepIndex;
          const progress = isCurrentStep ? stepProgress : 1;
          const canvasScale = (renderedWidth || contentWidth) / contentWidth;
          return (
            <div
              key={`image-overlay-${step.id}`}
              data-wbstep-overlay={step.id}
              style={{
                position: "absolute",
                left: l.x * canvasScale,
                top: l.y * canvasScale,
                transform: `scale(${canvasScale})`,
                transformOrigin: "top left",
                pointerEvents: "none",
              }}
            >
              <WbImage
                action={action}
                width={l.width}
                progress={progress}
                isAnimating={isCurrentStep && stepProgress < 1}
                onMeasure={(h) => handleMeasure(step.id, h)}
              />
            </div>
          );
        })}

        {/* Table overlay — same HTML-overlay pattern. KaTeX cells render
            in canvas-scaled HTML so we never hit foreignObject. */}
        {steps.map((step, idx) => {
          if (!visibleStepIds.has(step.id)) return null;
          if (step.action.type !== "table") return null;
          if (hiddenStepIds.has(step.id)) return null;
          const action = step.action;
          const l = layoutMap.get(step.id);
          if (!l) return null;
          const isCurrentStep = idx === currentStepIndex;
          const progress = isCurrentStep ? stepProgress : 1;
          const canvasScale = (renderedWidth || contentWidth) / contentWidth;
          return (
            <div
              key={`table-overlay-${step.id}`}
              data-wbstep-overlay={step.id}
              style={{
                position: "absolute",
                left: l.x * canvasScale,
                top: l.y * canvasScale,
                transform: `scale(${canvasScale})`,
                transformOrigin: "top left",
                pointerEvents: "none",
              }}
            >
              <WbTable
                action={action}
                width={l.width}
                progress={progress}
                isAnimating={isCurrentStep && stepProgress < 1}
              />
            </div>
          );
        })}

        {/* Section heading overlay — same HTML-overlay pattern. */}
        {steps.map((step, idx) => {
          if (!visibleStepIds.has(step.id)) return null;
          if (step.action.type !== "section_heading") return null;
          if (hiddenStepIds.has(step.id)) return null;
          const action = step.action;
          const l = layoutMap.get(step.id);
          if (!l) return null;
          const isCurrentStep = idx === currentStepIndex;
          const progress = isCurrentStep ? stepProgress : 1;
          const canvasScale = (renderedWidth || contentWidth) / contentWidth;
          return (
            <div
              key={`section-heading-overlay-${step.id}`}
              data-wbstep-overlay={step.id}
              style={{
                position: "absolute",
                left: l.x * canvasScale,
                top: l.y * canvasScale,
                transform: `scale(${canvasScale})`,
                transformOrigin: "top left",
                pointerEvents: "none",
              }}
            >
              <WbSectionHeading
                action={action}
                width={l.width}
                progress={progress}
                isAnimating={isCurrentStep && stepProgress < 1}
                onMeasure={(h) => handleMeasure(step.id, h)}
              />
            </div>
          );
        })}

        {/* Word-problem composite — same HTML-overlay pattern. One
            step renders the whole prose + variables + equation card,
            so layout invariants live in exactly one renderer rather
            than spread across ad-hoc write_text + write_math
            sequences. */}
        {steps.map((step, idx) => {
          if (!visibleStepIds.has(step.id)) return null;
          if (step.action.type !== "word_problem") return null;
          if (hiddenStepIds.has(step.id)) return null;
          const action = step.action;
          const l = layoutMap.get(step.id);
          if (!l) return null;
          const isCurrentStep = idx === currentStepIndex;
          const progress = isCurrentStep ? stepProgress : 1;
          const canvasScale = (renderedWidth || contentWidth) / contentWidth;
          return (
            <div
              key={`word-problem-overlay-${step.id}`}
              data-wbstep-overlay={step.id}
              style={{
                position: "absolute",
                left: l.x * canvasScale,
                top: l.y * canvasScale,
                transform: `scale(${canvasScale})`,
                transformOrigin: "top left",
                pointerEvents: "none",
              }}
            >
              <WbWordProblem
                action={action}
                width={l.width}
                progress={progress}
                isAnimating={isCurrentStep && stepProgress < 1}
                onMeasure={(h) => handleMeasure(step.id, h)}
              />
            </div>
          );
        })}

        {/* Fly-in substitution: for each substitute-apply step that
            has a `flyInSubstitution` AND is the current step, render
            one moving <motion.div> per pair. The flight starts at the
            source step's tagged value (in the previous step's DOM) and
            lands on the target span's position in this step's equation.
            On arrival, swap the val span to visible and fade the ghost
            var span out — the value has "replaced" the variable. */}
        {(() => {
          const stepIdx = currentStepIndex;
          if (stepIdx < 0 || stepIdx >= steps.length) return null;
          const step = steps[stepIdx];
          if (!step) return null;
          if (step.action.type !== "write_math") return null;
          if (!visibleStepIds.has(step.id)) return null;
          if (hiddenStepIds.has(step.id)) return null;
          const fly = step.flyInSubstitution;
          if (!fly) return null;
          const l = layoutMap.get(step.id);
          if (!l) return null;
          const canvasScale = (renderedWidth || contentWidth) / contentWidth;
          const dstAlign = alignOffsets.get(step.id) ?? 0;

          // Find the source step (nearest preceding visible write_math
          // step). Same algorithm the cross-step arrows use.
          let srcStep: WhiteboardStep | undefined;
          for (let j = stepIdx - 1; j >= 0; j--) {
            const s = steps[j];
            if (visibleStepIds.has(s.id) && s.action.type === "write_math") {
              srcStep = s;
              break;
            }
          }
          if (!srcStep) return null;
          const srcLayout = layoutMap.get(srcStep.id);
          if (!srcLayout) return null;
          const srcAlign = alignOffsets.get(srcStep.id) ?? 0;

          const srcRects = spanRects.get(srcStep.id) ?? {};
          const dstRects = spanRects.get(step.id) ?? {};

          const travelMs = fly.travelMs ?? 1900;
          // staggerMs in "sequential" mode is the GAP after each pair
          // lands before the next launches (default 100ms breath).
          // In "parallel" mode it's the overlap-stagger between
          // launches as before.
          const staggerMs = fly.staggerMs ?? 100;
          const timing = fly.timing ?? "sequential";
          const pathMode = fly.path ?? "arc";
          const easing = fly.easing ?? "cubic-bezier(0.34, 1.56, 0.64, 1)";

          return fly.pairs.map((pair, i) => {
            const srcId = pair.fromSrcSpanId ?? `src-${pair.fromSpan.replace(/^var-/, "")}`;
            const sr = srcRects[srcId];
            const dr = dstRects[pair.toSpan];
            if (!sr || !dr) return null;

            // Trajectory in 1000-unit space (same math as
            // cross-step arrows ~ line 737).
            const x1u = srcLayout.x + sr.centerX + srcAlign;
            const y1u = srcLayout.y + (sr.top + sr.bottom) / 2;
            const x2u = l.x + dr.centerX + dstAlign;
            const y2u = l.y + (dr.top + dr.bottom) / 2;

            // Convert to viewport pixels.
            const x1 = x1u * canvasScale;
            const y1 = y1u * canvasScale;
            const x2 = x2u * canvasScale;
            const y2 = y2u * canvasScale;

            // Read source text + color from the live DOM. The source
            // step's overlay div has data-wbstep-overlay={srcStep.id}.
            // Inside it, the span with class `srcId` carries the value
            // text and color (color may be on a child via \textcolor).
            let text = "?";
            let color = "currentColor";
            let fontSize = 22;
            if (typeof document !== "undefined") {
              const srcEl = document.querySelector<HTMLElement>(
                `[data-wbstep-overlay="${srcStep.id}"] .${srcId}`,
              );
              if (srcEl) {
                text = (srcEl.textContent ?? "").trim() || text;
                // \textcolor renders as a child span with inline color.
                // Walk descendants for the deepest inline color.
                let colorEl: HTMLElement | null = null;
                const stack: HTMLElement[] = [srcEl];
                while (stack.length) {
                  const e = stack.pop()!;
                  if (e.style.color) colorEl = e;
                  for (const c of Array.from(e.children)) stack.push(c as HTMLElement);
                }
                color = (colorEl?.style.color) || getComputedStyle(srcEl).color || color;
                const cs = getComputedStyle(srcEl);
                const fs = parseFloat(cs.fontSize);
                if (Number.isFinite(fs) && fs > 0) {
                  // The source span's font-size is in 1000-unit space
                  // (CSS pixels of the unscaled wrapper). Multiply by
                  // canvasScale to get viewport pixels for the flying
                  // div, which is positioned in viewport space.
                  fontSize = fs * canvasScale;
                }
              }
            }

            // Fade the variable name (in the ghost) starting at 75% of
            // its OWN flight. Duration spans the remaining 25% of
            // travel so it's gone right at landing — each variable
            // dims out sequentially, in sync with its specific flight.
            const varFadeDurationMs = Math.max(150, travelMs * 0.25);
            const onVarFade = () => {
              // Mark this pair as "var-fading" in canvas state so
              // subsequent re-renders of WbMath keep this var at
              // opacity 0 instead of resetting it. Var fade starts
              // BEFORE the val arrives (at 75% of travel vs 85%), so
              // this is its own milestone — separate from arrivedPairs.
              setFadedPairs((prev) => {
                const next = new Map(prev);
                const set = new Set(next.get(step.id) ?? []);
                set.add(i);
                next.set(step.id, set);
                return next;
              });
              if (typeof document === "undefined") return;
              const dstOverlay = document.querySelector<HTMLElement>(
                `[data-wbstep-overlay="${step.id}"]`,
              );
              if (!dstOverlay) return;
              const varEls = dstOverlay.querySelectorAll<HTMLElement>(
                `.${pair.fromSpan}`,
              );
              for (const v of Array.from(varEls)) {
                v.style.transition = `opacity ${varFadeDurationMs}ms ease-out`;
                v.style.opacity = "0";
              }
            };
            const onArrive = () => {
              // Mark this pair as arrived in canvas state so subsequent
              // re-renders of WbMath (which re-fire the main render
              // effect and re-run the val-span-hiding pass) keep this
              // val visible instead of snapping it back to opacity 0.
              setArrivedPairs((prev) => {
                const next = new Map(prev);
                const set = new Set(next.get(step.id) ?? []);
                set.add(i);
                next.set(step.id, set);
                return next;
              });
              // Toggle the target val span on (it was hidden by
              // wb-math's flyInSubstitution setup). The var span has
              // already started fading from onVarFade above; we don't
              // touch it again here.
              if (typeof document === "undefined") return;
              const dstOverlay = document.querySelector<HTMLElement>(
                `[data-wbstep-overlay="${step.id}"]`,
              );
              if (!dstOverlay) return;
              const valEl = dstOverlay.querySelector<HTMLElement>(
                `.${pair.toSpan}`,
              );
              if (valEl) {
                // Padding-right set by wb-math stays in place during
                // the morph — held at the ghost-width footprint to
                // keep surrounding parens / operators stable across
                // multi-substitution sequences. The contraction back
                // to natural width fires once, after the LAST pair
                // arrives (see settledSteps trigger below).
                valEl.style.transition = "opacity 200ms ease-out";
                valEl.style.opacity = "1";
              }
              // Last pair landed — schedule a single contraction.
              // Short dwell so the final value reads before the layout
              // tightens. WbMath picks this up via the `settled` prop
              // and animates padding-right to 0 on every val span.
              if (i === fly.pairs.length - 1) {
                const SETTLE_DWELL_MS = 500;
                setTimeout(() => {
                  setSettledSteps((prev) => {
                    if (prev.has(step.id)) return prev;
                    const next = new Set(prev);
                    next.add(step.id);
                    return next;
                  });
                }, SETTLE_DWELL_MS);
              }
            };

            return (
              <FlyInFlight
                key={`fly-${step.id}-${i}`}
                flightKey={`fly-${step.id}-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                text={text}
                color={color}
                fontSize={fontSize}
                delayMs={
                  timing === "sequential"
                    // Each pair waits for the prior to land + a small
                    // gap; pair 0 launches at 0.
                    ? i * (travelMs + staggerMs)
                    // Parallel: stagger overlap as before.
                    : i * staggerMs
                }
                travelMs={travelMs}
                path={pathMode}
                easing={easing}
                onVarFade={onVarFade}
                onArrive={onArrive}
              />
            );
          });
        })()}
      </div>
      </div>
    </div>
    {showLatestButton && (
      <button
        type="button"
        onClick={scrollToLatest}
        className="absolute left-1/2 -translate-x-1/2 bottom-6 z-10 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium shadow-lg backdrop-blur transition-colors"
        style={{
          background: "oklch(0.22 0.06 275 / 0.85)",
          color: "oklch(0.92 0.02 285)",
          border: "1px solid oklch(0.45 0.10 275 / 0.55)",
        }}
      >
        See latest
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    )}
    </div>
  );
}
