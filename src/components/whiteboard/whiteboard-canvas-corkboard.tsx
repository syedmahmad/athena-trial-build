"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { motion } from "framer-motion";
import katex from "katex";
import type { StepFocus } from "./pen-tip";
import type {
  WhiteboardStep,
  CalloutAction,
  SectionHeadingAction,
  CheckInAction,
  PredictAction,
  FillBlankAction,
  PulseCheckAction,
} from "@/types/whiteboard";
import styles from "./whiteboard-canvas-corkboard.module.css";

type Props = {
  steps: WhiteboardStep[];
  visibleStepIds: Set<number>;
  currentStepIndex: number;
  stepProgress: number;
  equalScaleCoords?: boolean;
  /** Accepted for parity with WhiteboardCanvas (this corkboard reskin
   *  renders a single hero step, so it ignores the content-width knob). */
  contentWidth?: number;
  /** Accepted for parity with WhiteboardCanvas; this reskin auto-pins to
   *  its single hero step, so it ignores the follow-nonce. */
  resumeFollowNonce?: number;
  selections?: unknown;
  onElementSelect?: (el: unknown) => void;
  onElementToggle?: (el: unknown) => void;
  onElementsSelect?: (els: unknown) => void;
  /** Accepted for prop-shape parity with WhiteboardCanvas; unused here. */
  onPenTip?: (clientPoint: { x: number; y: number } | null) => void;
  /** Accepted for prop-shape parity with WhiteboardCanvas; unused here. */
  sequentialDiagrams?: boolean;
  /** Accepted for prop-shape parity with WhiteboardCanvas; unused here. */
  onStepFocus?: (focus: StepFocus | null) => void;
};

/** Index-card position in world coordinates, plus a per-card
 *  rotation offset so the wall feels handpinned not gridded. */
type CardSlot = { x: number; y: number; rot: number };

/** A 2-D cubic-bezier control point used to bow the red thread
 *  into a slack curve between two cards. */
type ThreadCurve = {
  c1x: number; c1y: number; c2x: number; c2y: number;
};

type ExtraThread = { from: number; to: number };

/** Pushpin's world-coordinate position. With the card hanging FROM
 *  its top-center (transform-origin: 50% 0% on the outer
 *  positioning element), the pin spot is the slot coordinate
 *  itself — no height math, no rotation correction needed. */
function pinAnchor(slot: CardSlot): { x: number; y: number } {
  return { x: slot.x, y: slot.y };
}

/** Deterministic pseudo-random based on step index — so layout is
 *  stable across re-renders. */
function rand(seed: number): number {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function generateLayout(count: number): CardSlot[] {
  const slots: CardSlot[] = [];
  let cx = 0;
  let cy = 0;
  let lastAngle = -Math.PI / 2; // start aimed up
  for (let i = 0; i < count; i++) {
    if (i === 0) {
      slots.push({ x: 0, y: 0, rot: (rand(i * 7.7) - 0.5) * 5 });
      continue;
    }
    // Pick an angle that's near-random but biased away from the
    // last direction so the trail walks across the wall instead of
    // doubling back. Range ±~120° relative to last angle.
    const turn = (rand(i * 1.61) - 0.5) * 2.4;
    const angle = lastAngle + turn;
    const dist = 540 + rand(i * 2.7) * 220; // 540–760px
    cx += Math.cos(angle) * dist;
    cy += Math.sin(angle) * dist;
    lastAngle = angle;
    const rot = (rand(i * 3.1) - 0.5) * 7;
    slots.push({ x: cx, y: cy, rot });
  }
  return slots;
}

function threadCurve(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  seed: number,
): ThreadCurve {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  // Tight string aesthetic — barely-perceptible sag plus a tiny
  // perpendicular jitter so two threads passing over each other
  // don't sit perfectly on the same line.
  const baseSag = Math.min(18, len * 0.022);
  const px = -dy / len;
  const py = dx / len;
  const sagSign = py > 0 ? 1 : -1;
  const sag = baseSag * sagSign;
  const j1 = (rand(seed * 5.3) - 0.5) * 6;
  const j2 = (rand(seed * 7.1) - 0.5) * 6;
  return {
    c1x: p1.x + dx * 0.30 + px * sag + j1,
    c1y: p1.y + dy * 0.30 + py * sag,
    c2x: p1.x + dx * 0.70 + px * sag + j2,
    c2y: p1.y + dy * 0.70 + py * sag,
  };
}

/** Extra (non-chain) connections — pin some cards back to a
 *  non-adjacent earlier card to weave a criss-crossing web instead
 *  of a single chain. Deterministic by slot index. */
function generateExtras(count: number): ExtraThread[] {
  const out: ExtraThread[] = [];
  const seen = new Set<string>();
  const push = (from: number, to: number) => {
    if (from === to - 1 || from >= to || from < 0) return;
    const key = `${from}-${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ from, to });
  };
  for (let i = 2; i < count; i++) {
    if (rand(i * 11.7 + 5) < 0.65) {
      const back = 2 + Math.floor(rand(i * 13.3) * 3); // 2–4 back
      push(Math.max(0, i - back), i);
    }
    if (i > 3 && rand(i * 17.9 + 7) < 0.40) {
      const back = 3 + Math.floor(rand(i * 19.1) * 4); // 3–6 back
      push(Math.max(0, i - back), i);
    }
  }
  return out;
}

export function WhiteboardCanvasCorkboard({
  steps,
  visibleStepIds,
  currentStepIndex,
}: Props) {
  // Stable layout — one slot per step in the lesson, regardless of
  // visibility. Keeps a card's pinned spot fixed once placed.
  const layout = useMemo(() => generateLayout(steps.length), [steps.length]);
  const extras = useMemo(() => generateExtras(steps.length), [steps.length]);

  const visibleSteps = useMemo(
    () => steps.filter((s) => visibleStepIds.has(s.id)),
    [steps, visibleStepIds],
  );

  // Map step id → its slot index (= original step index in `steps`).
  const slotByStepId = useMemo(() => {
    const map = new Map<number, number>();
    steps.forEach((s, i) => map.set(s.id, i));
    return map;
  }, [steps]);

  // Threads connect successive ORIGINAL step indices that are both
  // visible. So if step 4 is visible but step 3 isn't, no thread
  // is drawn to step 4 (there's no anchor in the visible set).
  const visibleSlotIdxs = useMemo(
    () =>
      visibleSteps
        .map((s) => slotByStepId.get(s.id))
        .filter((i): i is number => typeof i === "number")
        .sort((a, b) => a - b),
    [visibleSteps, slotByStepId],
  );
  const visibleSlotIdxSet = useMemo(
    () => new Set(visibleSlotIdxs),
    [visibleSlotIdxs],
  );

  // Hero — derived from currentStepIndex (which is an index into the
  // full `steps` array). Fall back to the newest visible step when
  // currentStepIndex points at something that isn't visible yet.
  const heroSlotIdx = useMemo(() => {
    const direct = Math.max(0, Math.min(currentStepIndex, steps.length - 1));
    if (visibleSlotIdxSet.has(direct)) return direct;
    return visibleSlotIdxs[visibleSlotIdxs.length - 1] ?? 0;
  }, [currentStepIndex, steps.length, visibleSlotIdxSet, visibleSlotIdxs]);
  const heroSlot = layout[heroSlotIdx] ?? { x: 0, y: 0, rot: 0 };

  // The newest visible step's slot index — used to mark the just-
  // drawn thread for the draw-in animation.
  const newestSlotIdx = visibleSlotIdxs[visibleSlotIdxs.length - 1] ?? -1;

  return (
    <div className={styles.wall} data-canvas="corkboard-v3">
      <div className={styles.cork} aria-hidden="true" />

      <div className={styles.viewport}>
        <motion.div
          className={styles.world}
          animate={{
            x: -heroSlot.x,
            y: -heroSlot.y,
            rotate: -heroSlot.rot * 0.18,
          }}
          transition={{
            type: "spring",
            stiffness: 55,
            damping: 16,
            mass: 1.4,
          }}
        >
          {/* Cards (z-1) — paint first, threads stretch on top.
           *
           * Each card has TWO layers:
           *  - .cardOuter: positioned at the slot's pin world coord,
           *    statically rotated around its top-center. The card
           *    hangs from this pin point.
           *  - .card (motion): the visible card body, fully owned by
           *    Framer for the entrance spring (y/opacity/scale). Its
           *    transforms don't conflict with the outer's rotation. */}
          {visibleSteps.map((step) => {
            const slotIdx = slotByStepId.get(step.id);
            if (slotIdx === undefined) return null;
            const slot = layout[slotIdx];
            if (!slot) return null;
            const isHero = slotIdx === visibleSlotIdxs[visibleSlotIdxs.length - 1];
            return (
              <div
                key={step.id}
                className={`${styles.cardOuter} ${isHero ? styles.cardOuterActive : ""}`}
                style={
                  {
                    left: `${slot.x}px`,
                    top: `${slot.y}px`,
                    "--card-rot": `${slot.rot}deg`,
                  } as CSSProperties
                }
              >
                <motion.div
                  className={`${styles.card} ${isHero ? styles.cardActive : ""} ${
                    step.action.type === "callout" ? styles.cardCallout : ""
                  }`}
                  data-variant={
                    step.action.type === "callout"
                      ? (step.action as CalloutAction).variant
                      : undefined
                  }
                  initial={{ opacity: 0, scale: 0.7, y: -120 }}
                  animate={{
                    opacity: 1,
                    scale: isHero ? 1.04 : 0.92,
                    y: 0,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 180,
                    damping: 14,
                    mass: 0.9,
                    delay: isHero ? 0.18 : 0,
                  }}
                >
                  <CardContent step={step} />
                </motion.div>
              </div>
            );
          })}

          {/* Threads (z-3) — connect pin to pin, paint above cards.
           *
           * Two layers: the primary chain (consecutive visible slots)
           * and the criss-cross extras (deterministic back-edges that
           * weave a web). Both are drawn between pin world coords. */}
          <svg className={styles.threads} aria-hidden="true">
            {visibleSlotIdxs.slice(1).map((idx, i) => {
              const prevSlot = layout[visibleSlotIdxs[i]];
              const currSlot = layout[idx];
              if (!prevSlot || !currSlot) return null;
              const a = pinAnchor(prevSlot);
              const b = pinAnchor(currSlot);
              const c = threadCurve(a, b, idx * 31);
              const d = `M ${a.x},${a.y} C ${c.c1x},${c.c1y} ${c.c2x},${c.c2y} ${b.x},${b.y}`;
              const isNew = idx === newestSlotIdx;
              return (
                <g key={`chain-${idx}`}>
                  <path className={styles.threadShadow} d={d} />
                  <path
                    className={`${styles.thread} ${isNew ? styles.threadNew : ""}`}
                    d={d}
                    pathLength={isNew ? 1 : undefined}
                  />
                </g>
              );
            })}
            {extras.map((ex) => {
              if (!visibleSlotIdxSet.has(ex.from) || !visibleSlotIdxSet.has(ex.to)) {
                return null;
              }
              const fromSlot = layout[ex.from];
              const toSlot = layout[ex.to];
              if (!fromSlot || !toSlot) return null;
              const a = pinAnchor(fromSlot);
              const b = pinAnchor(toSlot);
              const c = threadCurve(a, b, ex.from * 53 + ex.to * 17);
              const d = `M ${a.x},${a.y} C ${c.c1x},${c.c1y} ${c.c2x},${c.c2y} ${b.x},${b.y}`;
              const isNew = ex.to === newestSlotIdx;
              return (
                <g key={`extra-${ex.from}-${ex.to}`}>
                  <path className={`${styles.threadShadow} ${styles.threadShadowExtra}`} d={d} />
                  <path
                    className={`${styles.thread} ${styles.threadExtra} ${isNew ? styles.threadNew : ""}`}
                    d={d}
                    pathLength={isNew ? 1 : undefined}
                  />
                </g>
              );
            })}
          </svg>

          {/* Pin layer (z-4) — paints after threads so pin heads
           *  cover the thread end at each anchor point. Each pin
           *  is positioned at its slot's pin world coord and
           *  rotated to match the card so it visually sticks out
           *  of the card's top edge consistently. */}
          {visibleSteps.map((step) => {
            const slotIdx = slotByStepId.get(step.id);
            if (slotIdx === undefined) return null;
            const slot = layout[slotIdx];
            if (!slot) return null;
            const anchor = pinAnchor(slot);
            return (
              <div
                key={`pin-${step.id}`}
                className={styles.pinAnchored}
                style={{
                  left: `${anchor.x}px`,
                  top: `${anchor.y}px`,
                }}
              >
                <Pushpin />
              </div>
            );
          })}
        </motion.div>
      </div>

      {/* HUD — fixed labels in the viewport corners (don't move
       *      with the world). */}
      <div className={styles.hud} aria-hidden="true">
        <div className={`${styles.hudCorner} ${styles.tl}`}>
          <span>case file</span> · sat / algebra
        </div>
        <div className={`${styles.hudCorner} ${styles.tr}`}>
          step {String(heroSlotIdx + 1).padStart(2, "0")} ·{" "}
          <span>{String(steps.length).padStart(2, "0")}</span>
        </div>
        <div className={`${styles.hudCorner} ${styles.bl}`}>
          v3 · corkboard
        </div>
        <div className={`${styles.hudCorner} ${styles.br}`}>
          <span>●</span> tracing the connections
        </div>
      </div>
    </div>
  );
}

// ── Card content ─────────────────────────────────────────────────

function CardContent({ step }: { step: WhiteboardStep }) {
  const a = step.action;
  switch (a.type) {
    case "write_math":
      return (
        <>
          <div className={styles.cardEyebrow}>
            <span>Step {String(step.id).padStart(2, "0")}</span>
            {step.operation ? (
              <span style={{ color: "inherit" }}>{step.operation}</span>
            ) : null}
          </div>
          <CardMath latex={a.latex} />
          {step.displayText ? (
            <div className={styles.cardCaption}>
              <MathText text={step.displayText} />
            </div>
          ) : null}
        </>
      );
    case "write_text":
      return (
        <>
          <div className={styles.cardEyebrow}>
            <span>Note {String(step.id).padStart(2, "0")}</span>
          </div>
          <div className={styles.cardText}>
            <MathText text={a.text} />
          </div>
        </>
      );
    case "section_heading": {
      const sh = a as SectionHeadingAction;
      return (
        <div>
          <div className={styles.cardEyebrow}>
            <span>Section</span>
          </div>
          <div className={styles.cardSection}>
            <MathText text={sh.text} />
          </div>
          {sh.subtitle ? (
            <div className={styles.cardSectionSub}>{sh.subtitle}</div>
          ) : null}
        </div>
      );
    }
    case "callout": {
      const c = a as CalloutAction;
      return (
        <>
          <div className={styles.cardEyebrow}>
            <span>{c.eyebrow ?? defaultEyebrow(c.variant)}</span>
          </div>
          <div className={styles.cardText}>
            <MathText text={c.body} />
          </div>
        </>
      );
    }
    case "check_in":
      return (
        <>
          <div className={styles.cardEyebrow}><span>Check-in</span></div>
          <CardMath latex={(a as CheckInAction).question} />
        </>
      );
    case "predict":
      return (
        <>
          <div className={styles.cardEyebrow}><span>Predict</span></div>
          <CardMath latex={(a as PredictAction).question} />
        </>
      );
    case "fill_blank": {
      const fb = a as FillBlankAction;
      return (
        <>
          <div className={styles.cardEyebrow}><span>Fill in</span></div>
          <CardMath latex={fb.prompt ?? fb.question ?? ""} />
        </>
      );
    }
    case "pulse_check":
      return (
        <>
          <div className={styles.cardEyebrow}><span>Quick pulse</span></div>
          <CardMath latex={(a as PulseCheckAction).question} />
        </>
      );
    default:
      return (
        <>
          <div className={styles.cardEyebrow}>
            <span>Note {String(step.id).padStart(2, "0")}</span>
          </div>
          <div className={styles.cardText}>
            {step.displayText ?? `[${a.type}]`}
          </div>
        </>
      );
  }
}

function CardMath({ latex }: { latex: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(latex, ref.current, {
        throwOnError: false,
        displayMode: true,
        trust: true,
        strict: "ignore",
      });
    } catch {
      if (ref.current) ref.current.textContent = latex;
    }
  }, [latex]);
  return <div ref={ref} className={styles.cardMath} />;
}

function MathText({ text }: { text: string | undefined | null }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    el.innerHTML = "";
    if (typeof text !== "string" || text.length === 0) return;
    const parts = text.split(/(\$[^$]+\$)/g);
    for (const part of parts) {
      if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
        const span = document.createElement("span");
        try {
          katex.render(part.slice(1, -1), span, {
            throwOnError: false,
            displayMode: false,
            trust: true,
            strict: "ignore",
          });
        } catch {
          span.textContent = part.slice(1, -1);
        }
        el.appendChild(span);
      } else if (part) {
        const t = document.createElement("span");
        t.textContent = part;
        el.appendChild(t);
      }
    }
  }, [text]);
  return <span ref={ref} />;
}

// ── Pushpin ─────────────────────────────────────────────────────

function Pushpin() {
  // Brass-and-shadow pin. SVG so the highlight + base colors don't
  // depend on raster assets. The pin "head" sits above the card's
  // top edge with a soft drop shadow.
  return (
    <div className={styles.pin}>
      <svg viewBox="0 0 28 28" aria-hidden="true">
        <defs>
          <radialGradient id="pin-head" cx="38%" cy="32%" r="70%">
            <stop offset="0%" stopColor="#ffe2b8" />
            <stop offset="35%" stopColor="#d6892a" />
            <stop offset="80%" stopColor="#7a3a0e" />
            <stop offset="100%" stopColor="#3a1a06" />
          </radialGradient>
          <radialGradient id="pin-shine" cx="35%" cy="30%" r="30%">
            <stop offset="0%" stopColor="rgba(255,235,200,0.95)" />
            <stop offset="100%" stopColor="rgba(255,235,200,0)" />
          </radialGradient>
        </defs>
        {/* Pin shaft (small triangle behind head) */}
        <path
          d="M 13.4 14 L 14.6 14 L 14 22 Z"
          fill="rgba(60,30,10,0.85)"
        />
        {/* Pin head */}
        <circle cx="14" cy="11" r="9" fill="url(#pin-head)" />
        {/* Specular highlight */}
        <ellipse cx="11" cy="8" rx="4" ry="3" fill="url(#pin-shine)" />
        {/* Outer ring */}
        <circle
          cx="14" cy="11" r="9"
          fill="none"
          stroke="rgba(0,0,0,0.45)"
          strokeWidth="0.6"
        />
      </svg>
    </div>
  );
}

function defaultEyebrow(variant: CalloutAction["variant"]): string {
  switch (variant) {
    case "hint": return "HINT";
    case "detailed-hint": return "DETAILED HINT";
    case "answer-correct": return "CORRECT";
    case "answer-incorrect": return "REVIEW";
    default: return "NOTE";
  }
}
