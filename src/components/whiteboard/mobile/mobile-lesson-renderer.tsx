"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type Easing } from "framer-motion";
import { X, ZoomIn } from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";
import styles from "./mobile-lesson-renderer.module.css";
import type {
  WhiteboardStep,
  WhiteboardAction,
  CalloutAction,
  WordProblemAction,
  TableAction,
  ImageAction,
  SectionHeadingAction,
  CoordinatePlaneAction,
  GeometryAction,
  NumberLineAction,
  FlyInSubstitution,
} from "@/types/whiteboard";
import { WbCoordinatePlane } from "@/components/whiteboard/elements/wb-coordinate-plane";
import { WbGeometry } from "@/components/whiteboard/elements/wb-geometry";
import { WbNumberLine } from "@/components/whiteboard/elements/wb-number-line";
import { animateTaggedSpans } from "@/components/whiteboard/elements/wb-math";

/**
 * Portrait mobile lesson renderer (Workstream A1 scaffold).
 *
 * Consumes the SAME `WhiteboardStep[]` IR + player state as the desktop
 * `WhiteboardCanvas`, so no lesson regeneration is required — this is a second
 * VIEW over the existing data. Instead of laying steps onto a 1000-unit
 * landscape board and CSS-scaling it down (which makes math illegible on a
 * phone), it stacks the visible teaching steps as full-width cards sized for a
 * narrow portrait column and auto-scrolls to the active step.
 *
 * Scope of this scaffold: the legible "spine" — section headings, math, prose,
 * callouts, word problems, tables, images. The SVG-graphics archetypes
 * (coordinate_plane / geometry / number_line) render as honest labeled
 * placeholders; porting them to portrait is the Phase A3 pass. Interaction
 * steps (check_in / predict / fill_blank / pulse_check) are intentionally NOT
 * rendered here — exactly as on desktop the canvas leaves them to the
 * surrounding lesson UI. The vertical-morph idiom that replaces desktop's
 * `=`-chain alignment is also Phase A3; here math simply renders at full size.
 */

export type MobileLessonRendererProps = {
  steps: WhiteboardStep[];
  visibleStepIds: Set<number>;
  currentStepIndex: number;
  /** Accepted for prop-contract parity with WhiteboardCanvas; the card stack
   *  does not animate intra-step progress in this scaffold. */
  stepProgress?: number;
};

/** Action types the canvas (and therefore this renderer) is responsible for
 *  painting. Interactions live in the surrounding lesson UI; highlight / erase
 *  / clear / draw_shape are metadata or decorative and contribute no card. */
const CARD_ACTION_TYPES = new Set<WhiteboardAction["type"]>([
  "section_heading",
  "write_math",
  "write_text",
  "callout",
  "word_problem",
  "table",
  "image",
  "coordinate_plane",
  "geometry",
  "number_line",
]);

/** A render unit is either a standalone step or an APPLY/COLLAPSE/STATE
 *  triplet group that morphs in place. */
type RenderUnit =
  | { kind: "single"; key: string; step: WhiteboardStep }
  | { kind: "group"; key: string; phases: WhiteboardStep[] };

const PHASE_RANK: Record<string, number> = { apply: 0, collapse: 1, state: 2 };

/** Fold all steps sharing an operationGroupId into one group unit; everything
 *  else stays a single. Groups are the seam the morph animates over — the
 *  desktop board reads a triplet left-to-right with =-chain alignment, but a
 *  phone reads it as one equation transforming in place.
 *
 *  Grouping is GLOBAL, not consecutive: a triplet's apply/collapse/state can be
 *  separated by interleaved steps (a highlight, a plot), so we gather every
 *  phase of a group regardless of position and emit the unit where the group
 *  first appears, absorbing its later phases. Interleaved non-group steps still
 *  render as their own cards at their own positions. */
function buildUnits(steps: WhiteboardStep[]): RenderUnit[] {
  const groups = new Map<string, WhiteboardStep[]>();
  for (const s of steps) {
    if (s.operationGroupId) {
      const arr = groups.get(s.operationGroupId);
      if (arr) arr.push(s);
      else groups.set(s.operationGroupId, [s]);
    }
  }
  for (const arr of groups.values()) {
    arr.sort(
      (a, b) =>
        (PHASE_RANK[a.phase ?? ""] ?? 99) - (PHASE_RANK[b.phase ?? ""] ?? 99)
    );
  }

  const emitted = new Set<string>();
  const units: RenderUnit[] = [];
  for (const s of steps) {
    const groupId = s.operationGroupId;
    if (groupId) {
      if (emitted.has(groupId)) continue; // later phases folded into the unit
      emitted.add(groupId);
      units.push({ kind: "group", key: `g:${groupId}`, phases: groups.get(groupId)! });
    } else {
      units.push({ kind: "single", key: `s:${s.id}`, step: s });
    }
  }
  return units;
}

/** Mirrors the desktop wb-callout guard: a callout without a real body renders
 *  nothing (the desktop drops these — older `{text, color}` callouts in some
 *  lessons carry no `body`, so showing an empty pill would diverge from the
 *  board). Every other card type is always renderable. */
function isRenderableCard(action: WhiteboardAction): boolean {
  if (action.type === "callout") {
    return typeof action.body === "string" && action.body.trim().length > 0;
  }
  return true;
}

function cardClassName(isActive: boolean): string {
  return [
    "rounded-2xl border bg-card px-4 py-4 transition-shadow",
    isActive
      ? "border-primary/50 shadow-md ring-1 ring-primary/30"
      : "border-border/60",
  ].join(" ");
}

/** The LaTeX a card can open full-screen, or null if it isn't a math step. */
function zoomableLatex(action: WhiteboardAction): string | null {
  return action.type === "write_math" ? action.latex : null;
}

export function MobileLessonRenderer({
  steps,
  visibleStepIds,
  currentStepIndex,
}: MobileLessonRendererProps) {
  const activeStepId = steps[currentStepIndex]?.id;
  const units = useMemo(() => buildUnits(steps), [steps]);
  const [zoomLatex, setZoomLatex] = useState<string | null>(null);

  const activeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeStepId]);

  const rendered = units.map((unit) => {
    if (unit.kind === "single") {
      const { step } = unit;
      if (
        !visibleStepIds.has(step.id) ||
        !CARD_ACTION_TYPES.has(step.action.type) ||
        !isRenderableCard(step.action)
      ) {
        return null;
      }
      const isActive = step.id === activeStepId;
      return (
        <CardShell
          key={unit.key}
          activeRef={isActive ? activeRef : undefined}
          stepId={step.id}
          isActive={isActive}
          zoom={zoomableLatex(step.action)}
          onZoom={setZoomLatex}
        >
          <StepCard step={step} />
        </CardShell>
      );
    }

    // Group: show the furthest-revealed phase; morph as later phases reveal.
    const visiblePhases = unit.phases.filter((p) => visibleStepIds.has(p.id));
    if (visiblePhases.length === 0) return null;
    const displayed = visiblePhases[visiblePhases.length - 1];
    const isActive = unit.phases.some((p) => p.id === activeStepId);
    return (
      <CardShell
        key={unit.key}
        activeRef={isActive ? activeRef : undefined}
        stepId={displayed.id}
        groupPhase={displayed.phase}
        isActive={isActive}
        zoom={zoomableLatex(displayed.action)}
        onZoom={setZoomLatex}
      >
        <MorphGroupCard displayed={displayed} />
      </CardShell>
    );
  });

  const anyVisible = rendered.some(Boolean);

  return (
    <div className={`mx-auto flex w-full max-w-[480px] flex-col gap-3 px-4 py-6 ${styles.morph}`}>
      {rendered}
      {!anyVisible && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No visible lesson steps yet.
        </p>
      )}
      {zoomLatex && (
        <ZoomOverlay latex={zoomLatex} onClose={() => setZoomLatex(null)} />
      )}
    </div>
  );
}

/** A card wrapper that animates in on reveal and, for math steps, opens a
 *  full-screen zoomable view on tap. */
function CardShell({
  activeRef,
  stepId,
  groupPhase,
  isActive,
  zoom,
  onZoom,
  children,
}: {
  activeRef?: React.Ref<HTMLDivElement>;
  stepId: number;
  groupPhase?: string;
  isActive: boolean;
  zoom: string | null;
  onZoom: (latex: string) => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      ref={activeRef}
      data-step-id={stepId}
      data-group-phase={groupPhase}
      data-active={isActive || undefined}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={`relative ${cardClassName(isActive)} ${zoom ? "cursor-zoom-in" : ""}`}
      onClick={zoom ? () => onZoom(zoom) : undefined}
      role={zoom ? "button" : undefined}
      aria-label={zoom ? "Tap to enlarge equation" : undefined}
    >
      {zoom && (
        <ZoomIn className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground/40" />
      )}
      {children}
    </motion.div>
  );
}

/** Full-screen enlarged equation with free pan (scroll), for when a step is
 *  too dense to read inline. Scrolls both axes; tap outside or the X to close. */
function ZoomOverlay({ latex, onClose }: { latex: string; onClose: () => void }) {
  const html = useMemo(
    () =>
      katex.renderToString(latex ?? "", {
        displayMode: true,
        throwOnError: false,
        output: "html",
        trust: true,
        strict: false,
      }),
    [latex]
  );
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-background/98 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex justify-end p-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full border border-border/60 bg-card p-2 text-foreground shadow-sm"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-auto px-6" onClick={(e) => e.stopPropagation()}>
        <div
          className="flex min-h-full min-w-min items-center justify-center py-6 text-[2.75rem] leading-tight text-foreground"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      <p className="select-none p-3 text-center text-xs text-muted-foreground">
        Scroll to pan · tap outside to close
      </p>
    </div>,
    document.body
  );
}

/** Cross-fades between a triplet's phases in place: the prior phase fades up
 *  and out while the next fades in from below, so one equation appears to
 *  transform rather than three near-duplicate rows stacking. Phase A3's
 *  vertical-morph idiom; the op-cancel / op-result role spans (styled by the
 *  shared whiteboard CSS) carry the per-operand emphasis through the morph. */
function MorphGroupCard({ displayed }: { displayed: WhiteboardStep }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={displayed.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <StepCard step={displayed} />
      </motion.div>
    </AnimatePresence>
  );
}

function StepCard({ step }: { step: WhiteboardStep }) {
  const action = step.action;
  switch (action.type) {
    case "section_heading":
      return <SectionHeadingCard action={action} />;
    case "write_math":
      if (step.flyInSubstitution) return <FlyInCard step={step} />;
      return <MathBlock latex={action.latex} operation={step.operation} phase={step.phase} />;
    case "write_text":
      return (
        <p className={textClassForStyle(action.style)}>
          <InlineRich text={action.text} />
        </p>
      );
    case "callout":
      return <CalloutCard action={action} />;
    case "word_problem":
      return <WordProblemCard action={action} />;
    case "table":
      return <TableCard action={action} />;
    case "image":
      return <ImageCard action={action} />;
    case "coordinate_plane":
    case "geometry":
    case "number_line":
      return <FigureCard action={action} />;
    default:
      return null;
  }
}

// ── Cards ───────────────────────────────────────────────────────────

function SectionHeadingCard({ action }: { action: SectionHeadingAction }) {
  return (
    <div>
      <h2 className="text-xl font-bold leading-tight text-foreground">
        <InlineRich text={action.text} />
      </h2>
      {action.subtitle && (
        <p className="mt-1 text-sm text-muted-foreground">
          <InlineRich text={action.subtitle} />
        </p>
      )}
    </div>
  );
}

const CALLOUT_ACCENT: Record<CalloutAction["variant"], string> = {
  hint: "border-l-amber-400 bg-amber-50 dark:bg-amber-950/30",
  "detailed-hint": "border-l-amber-500 bg-amber-50 dark:bg-amber-950/30",
  "answer-correct": "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
  "answer-incorrect": "border-l-rose-500 bg-rose-50 dark:bg-rose-950/30",
};

const CALLOUT_EYEBROW: Record<CalloutAction["variant"], string> = {
  hint: "HINT",
  "detailed-hint": "DETAILED HINT",
  "answer-correct": "CORRECT",
  "answer-incorrect": "NOT QUITE",
};

function CalloutCard({ action }: { action: CalloutAction }) {
  // Fall back to the hint styling for unknown variants, as the desktop does.
  const variant = action.variant in CALLOUT_ACCENT ? action.variant : "hint";
  return (
    <div className={`border-l-4 pl-3 ${CALLOUT_ACCENT[variant]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {action.eyebrow ?? CALLOUT_EYEBROW[variant]}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-foreground">
        <InlineRich text={action.body} />
      </p>
    </div>
  );
}

function WordProblemCard({ action }: { action: WordProblemAction }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-foreground">
        <InlineRich text={action.prose} />
      </p>
      {action.variables.length > 0 && (
        <dl className="flex flex-col gap-1 rounded-lg bg-muted/50 px-3 py-2">
          {action.variables.map((v, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <dt className="font-semibold">
                <MathInline latex={v.symbol} />
              </dt>
              <dd className="text-muted-foreground">{v.meaning}</dd>
            </div>
          ))}
        </dl>
      )}
      <MathBlock latex={action.equation} />
    </div>
  );
}

function TableCard({ action }: { action: TableAction }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {action.headers.map((h, i) => (
              <th
                key={i}
                className="border-b px-2 py-1.5 text-left font-semibold text-foreground"
              >
                <InlineRich text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {action.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className="border-b px-2 py-1.5 text-foreground">
                  <InlineRich text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImageCard({ action }: { action: ImageAction }) {
  return (
    <figure className="flex flex-col gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- lesson images are remote, arbitrary-host URLs */}
      <img
        src={action.src}
        alt={action.alt ?? ""}
        className="w-full rounded-lg object-contain"
      />
      {action.caption && (
        <figcaption className="text-xs text-muted-foreground">
          {action.caption}
        </figcaption>
      )}
      {action.attribution && (
        <figcaption className="text-[10px] text-muted-foreground/70">
          {action.attribution}
        </figcaption>
      )}
    </figure>
  );
}

type FigureAction = CoordinatePlaneAction | GeometryAction | NumberLineAction;

/** Logical SVG box per figure. The figures are self-contained islands defined
 *  in their own local space, so we render them into a fixed-aspect viewBox and
 *  let the SVG scale to the card width — no dependency on the 1000-unit board.
 *  Coordinate planes are square; geometry honors its authored aspect; number
 *  lines are short and wide. progress=1 / isAnimating=false paints the final
 *  figure (no draw-on animation in the static portrait card for now). */
function figureBox(action: FigureAction): [number, number] {
  switch (action.type) {
    case "coordinate_plane":
      return [360, 360];
    case "geometry": {
      const h = action.height && action.height > 0 ? Math.min(action.height, 360) : 280;
      return [360, h];
    }
    case "number_line":
      return [360, 120];
  }
}

function FigureCard({ action }: { action: FigureAction }) {
  const [w, h] = figureBox(action);
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      className="block h-auto max-w-full"
      role="img"
    >
      {action.type === "coordinate_plane" && (
        <WbCoordinatePlane
          action={action}
          x={0}
          y={0}
          width={w}
          height={h}
          progress={1}
          isAnimating={false}
        />
      )}
      {action.type === "geometry" && (
        <WbGeometry
          action={action}
          x={0}
          y={0}
          width={w}
          height={h}
          progress={1}
          isAnimating={false}
        />
      )}
      {action.type === "number_line" && (
        <WbNumberLine
          action={action}
          x={0}
          y={0}
          width={w}
          height={h}
          progress={1}
          isAnimating={false}
        />
      )}
    </svg>
  );
}

// ── Math + inline rich text ─────────────────────────────────────────

function MathBlock({
  latex,
  operation,
  phase,
}: {
  latex: string;
  operation?: string;
  phase?: string;
}) {
  const html = useMemo(
    () =>
      katex.renderToString(latex ?? "", {
        displayMode: true,
        throwOnError: false,
        output: "html",
        // c2-ir tags operands with \htmlClass{op-target|op-new|...}, which
        // KaTeX gates behind trust; strict:false allows the same macros the
        // desktop whiteboard relies on.
        trust: true,
        strict: false,
      }),
    [latex]
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  // Scale a too-wide equation down to the card width instead of letting it
  // scroll horizontally. Measured against the live container, re-run on resize.
  // The wrapper height is collapsed to the scaled height so there's no extra
  // whitespace left by the (layout-agnostic) transform.
  useEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;
    let active = true;
    let lastWidth = -1;
    const fit = () => {
      if (!active) return;
      inner.style.transform = "";
      wrap.style.height = "";
      const avail = wrap.clientWidth;
      const natural = inner.scrollWidth;
      if (!avail || !natural) return;
      const s = natural > avail ? avail / natural : 1;
      if (s < 1) {
        // Scale from the left edge: a too-wide inline-block is left-positioned
        // (text-align:center does NOT center content wider than its box), so a
        // center origin would shift it right and clip. From the left it scales
        // down to exactly fill the width.
        inner.style.transformOrigin = "left top";
        inner.style.transform = `scale(${s})`;
        wrap.style.height = `${inner.offsetHeight * s}px`;
      }
    };
    fit();
    // KaTeX's web fonts can widen the equation after first paint, which would
    // otherwise clip under overflow-hidden — re-fit once they've loaded.
    document.fonts?.ready?.then(() => fit());
    // Re-fit on real width changes only (the height we set must not re-trigger).
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w !== lastWidth) {
        lastWidth = w;
        fit();
      }
    });
    ro.observe(wrap);
    return () => {
      active = false;
      ro.disconnect();
    };
  }, [html]);

  // Per-operand animation, shared with the desktop board: op-new operands fade
  // and glow in, op-cancel terms strike + fade out on COLLAPSE, op-result pops
  // on STATE. Runs once per equation render (each revealed phase remounts this).
  useEffect(() => {
    if (innerRef.current) animateTaggedSpans(innerRef.current, operation, phase);
  }, [html, operation, phase]);

  return (
    <div
      ref={wrapRef}
      className="overflow-hidden py-1 text-center text-[1.35rem] text-foreground"
    >
      <div ref={innerRef} className="inline-block" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

// ── Fly-in substitution ─────────────────────────────────────────────
// Ported from the desktop whiteboard (whiteboard-canvas FlyInFlight). The
// trajectory + comet trail are container-agnostic (pure viewport-pixel coords),
// so they reuse as-is; the card-stack orchestration (frame both cards, measure
// across cards, swap ghost -> real) is mobile-specific.

function parseEase(easing: string): string | [number, number, number, number] {
  const m = easing.match(
    /cubic-bezier\(\s*([\d.\-]+)\s*,\s*([\d.\-]+)\s*,\s*([\d.\-]+)\s*,\s*([\d.\-]+)\s*\)/
  );
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  return easing;
}

type Flight = {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text: string;
  color: string;
  fontSize: string;
  delayMs: number;
  varSpan: string;
  isLast: boolean;
};

function FlyInFlight({
  flightKey,
  x1,
  y1,
  x2,
  y2,
  text,
  color,
  fontSize,
  delayMs,
  travelMs,
  path,
  easing,
  onVarFade,
  onArrive,
}: {
  flightKey: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text: string;
  color: string;
  fontSize: string;
  delayMs: number;
  travelMs: number;
  path: "arc" | "linear";
  easing: string;
  onVarFade: () => void;
  onArrive: () => void;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const bow = Math.min(60, Math.max(25, Math.abs(dy) * 0.12));
  const midX = x1 + dx * 0.5;
  const midY = Math.min(y1, y2) - bow;
  const xKeyframes = path === "arc" ? [x1, midX, x2] : [x1, x2];
  const yKeyframes = path === "arc" ? [y1, midY, y2] : [y1, y2];
  const ease = parseEase(easing) as Easing;
  const times = path === "arc" ? [0, 0.5, 1] : undefined;

  useEffect(() => {
    const tVar = setTimeout(onVarFade, delayMs + travelMs * 0.75);
    const tArrive = setTimeout(onArrive, delayMs + travelMs * 0.85);
    return () => {
      clearTimeout(tVar);
      clearTimeout(tArrive);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightKey]);

  const baseStyle = {
    position: "absolute" as const,
    left: 0,
    top: 0,
    color,
    fontSize,
    fontFamily: "KaTeX_Main, 'Times New Roman', serif",
    fontStyle: "italic" as const,
    whiteSpace: "nowrap" as const,
    pointerEvents: "none" as const,
    translate: "-50% -50%",
  };

  const TRAIL = 12;
  const trail = Array.from({ length: TRAIL }, (_, i) => {
    const t = (i + 1) / TRAIL;
    const o = 0.55 * (1 - t * 0.92);
    const sc = 0.95 - t * 0.6;
    return (
      <motion.div
        key={`${flightKey}-trail-${i}`}
        initial={{ x: x1, y: y1, opacity: 0, scale: sc * 1.05 }}
        animate={{
          x: xKeyframes,
          y: yKeyframes,
          opacity: [0, o, o, 0],
          scale: [sc * 1.05, sc, sc * 1.02, sc * 0.4],
        }}
        transition={{
          x: { duration: travelMs / 1000, delay: (delayMs + (i + 1) * 55) / 1000, ease, times },
          y: { duration: travelMs / 1000, delay: (delayMs + (i + 1) * 55) / 1000, ease, times },
          opacity: { duration: travelMs / 1000, delay: (delayMs + (i + 1) * 55) / 1000, times: [0, 0.12, 0.78, 1], ease: "linear" },
          scale: { duration: travelMs / 1000, delay: (delayMs + (i + 1) * 55) / 1000, times: [0, 0.5, 0.78, 1], ease: "easeOut" },
        }}
        style={{
          ...baseStyle,
          willChange: "transform, opacity, filter",
          filter: `blur(${(1 + t * 2.5).toFixed(2)}px) drop-shadow(0 0 ${(6 + t * 8).toFixed(1)}px ${color})`,
        }}
      >
        {text}
      </motion.div>
    );
  });

  return (
    <>
      {trail}
      <motion.div
        initial={{ x: x1, y: y1, opacity: 0, scale: 1.15 }}
        animate={{ x: xKeyframes, y: yKeyframes, opacity: [0, 1, 1, 0], scale: [1.15, 1.0, 1.05, 1.6] }}
        transition={{
          x: { duration: travelMs / 1000, delay: delayMs / 1000, ease, times },
          y: { duration: travelMs / 1000, delay: delayMs / 1000, ease, times },
          opacity: { duration: travelMs / 1000, delay: delayMs / 1000, times: [0, 0.12, 0.78, 1], ease: "linear" },
          scale: { duration: travelMs / 1000, delay: delayMs / 1000, times: [0, 0.5, 0.78, 1], ease: "easeOut" },
        }}
        style={{ ...baseStyle, willChange: "transform, opacity", filter: `drop-shadow(0 0 5px ${color})` }}
      >
        {text}
      </motion.div>
    </>
  );
}

/**
 * Renders a fly-in substitution step: the ghost equation (fromLatex, variables
 * shown) appears, each value arcs from where it was defined (its src-* span in
 * an earlier card) to the variable's slot, the variable fades on arrival, and
 * once the last value lands the card cross-fades to the real equation — whose
 * op-new values then glow in via the shared per-operand animation.
 *
 * Option A ("frame both, then arc"): the source and apply steps are adjacent,
 * so scrolling the apply card to center brings the source card into view; we
 * wait for that to settle before measuring viewport rects across the two cards.
 */
function FlyInCard({ step }: { step: WhiteboardStep }) {
  const fly = step.flyInSubstitution as FlyInSubstitution;
  const realLatex = step.action.type === "write_math" ? step.action.latex : "";
  const ghostHtml = useMemo(
    () =>
      katex.renderToString(fly.fromLatex ?? "", {
        displayMode: true,
        throwOnError: false,
        output: "html",
        trust: true,
        strict: false,
      }),
    [fly.fromLatex]
  );
  const ghostRef = useRef<HTMLDivElement>(null);
  const [resolved, setResolved] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);

  const travelMs = fly.travelMs ?? 1900;
  const staggerMs = fly.staggerMs ?? 100;
  const timing = fly.timing ?? "sequential";
  const path = fly.path ?? "arc";
  const easing = fly.easing ?? "cubic-bezier(0.34, 1.56, 0.64, 1)";

  useEffect(() => {
    const ghost = ghostRef.current;
    if (!ghost) return;

    // Frame both cards: center the apply card so the (adjacent) source card is
    // in view, then settle before measuring.
    ghost.closest("[data-step-id]")?.scrollIntoView({ behavior: "smooth", block: "center" });

    const timer = setTimeout(() => {
      const launched: Flight[] = [];
      fly.pairs.forEach((pair, i) => {
        const varEl = ghost.querySelector<HTMLElement>(`.${pair.fromSpan}`);
        if (!varEl) return;
        const vr = varEl.getBoundingClientRect();
        const x2 = vr.left + vr.width / 2;
        const y2 = vr.top + vr.height / 2;

        const srcId = pair.fromSrcSpanId ?? `src-${pair.fromSpan.replace(/^var-/, "")}`;
        const srcEl = document.querySelector<HTMLElement>(`.${srcId}`);
        const srcVisible =
          srcEl &&
          (() => {
            const r = srcEl.getBoundingClientRect();
            return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
          })();

        let x1: number, y1: number, text: string, color: string;
        if (srcEl && srcVisible) {
          const sr = srcEl.getBoundingClientRect();
          x1 = sr.left + sr.width / 2;
          y1 = sr.top + sr.height / 2;
          text = (srcEl.textContent ?? "").trim();
          color = getComputedStyle(srcEl).color;
        } else {
          // Fallback: source is off-screen — arc in from just above the slot.
          x1 = x2;
          y1 = y2 - 110;
          text = (srcEl?.textContent ?? varEl.textContent ?? "").trim();
          color = getComputedStyle(varEl).color;
        }

        const delayMs = timing === "sequential" ? i * (travelMs + staggerMs) : i * staggerMs;
        launched.push({
          key: `${step.id}-${i}`,
          x1,
          y1,
          x2,
          y2,
          text: text || "?",
          color,
          fontSize: getComputedStyle(varEl).fontSize,
          delayMs,
          varSpan: pair.fromSpan,
          isLast: i === fly.pairs.length - 1,
        });
      });
      if (launched.length === 0) {
        setResolved(true);
      } else {
        setFlights(launched);
      }
    }, 420);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onVarFade = (varSpan: string) => {
    const ghost = ghostRef.current;
    ghost?.querySelectorAll<HTMLElement>(`.${varSpan}`).forEach((el) => {
      el.style.transition = "opacity 400ms ease-out";
      el.style.opacity = "0";
    });
  };
  const onArrive = (isLast: boolean) => {
    if (isLast) setTimeout(() => setResolved(true), 500);
  };

  if (resolved) {
    return <MathBlock latex={realLatex} operation={step.operation} phase={step.phase} />;
  }

  return (
    <div className="relative">
      <div
        ref={ghostRef}
        className="overflow-hidden py-1 text-center text-[1.35rem] text-foreground"
        dangerouslySetInnerHTML={{ __html: ghostHtml }}
      />
      {flights.length > 0 &&
        createPortal(
          <div data-fly-in className="pointer-events-none fixed inset-0 z-[90]">
            {flights.map((f) => (
              <FlyInFlight
                key={f.key}
                flightKey={f.key}
                x1={f.x1}
                y1={f.y1}
                x2={f.x2}
                y2={f.y2}
                text={f.text}
                color={f.color}
                fontSize={f.fontSize}
                delayMs={f.delayMs}
                travelMs={travelMs}
                path={path}
                easing={easing}
                onVarFade={() => onVarFade(f.varSpan)}
                onArrive={() => onArrive(f.isLast)}
              />
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

function MathInline({ latex }: { latex: string }) {
  const html = useMemo(
    () =>
      katex.renderToString(latex ?? "", {
        displayMode: false,
        throwOnError: false,
        output: "html",
        // c2-ir tags operands with \htmlClass{op-target|op-new|...}, which
        // KaTeX gates behind trust; strict:false allows the same macros the
        // desktop whiteboard relies on.
        trust: true,
        strict: false,
      }),
    [latex]
  );
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Renders text that may contain inline `$...$` KaTeX, mirroring how the
 *  desktop overlay handles prose with embedded math. */
function InlineRich({ text }: { text: string }) {
  const parts = useMemo(() => splitInlineMath(text), [text]);
  return (
    <>
      {parts.map((part, i) =>
        part.math ? (
          <MathInline key={i} latex={part.value} />
        ) : (
          <span key={i}>{part.value}</span>
        )
      )}
    </>
  );
}

function splitInlineMath(text: string): { math: boolean; value: string }[] {
  // Defensive: lesson IR can carry undefined/empty strings (ragged table
  // rows, optional headings) — coerce rather than crash the whole renderer.
  if (!text) return [{ math: false, value: "" }];
  const out: { math: boolean; value: string }[] = [];
  const re = /\$([^$]+)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ math: false, value: text.slice(last, m.index) });
    out.push({ math: true, value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ math: false, value: text.slice(last) });
  return out.length ? out : [{ math: false, value: text }];
}

function textClassForStyle(style?: { fontSize?: string; fontWeight?: string }): string {
  const size =
    style?.fontSize === "lg" || style?.fontSize === "xl"
      ? "text-lg"
      : style?.fontSize === "sm"
        ? "text-xs"
        : "text-sm";
  const weight = style?.fontWeight === "bold" ? "font-semibold" : "font-normal";
  return `${size} ${weight} leading-relaxed text-foreground`;
}
