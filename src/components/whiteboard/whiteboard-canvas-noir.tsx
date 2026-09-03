"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import katex from "katex";
import type { StepFocus } from "./pen-tip";
import type {
  WhiteboardStep,
  WhiteboardAction,
  CalloutAction,
  SectionHeadingAction,
  CheckInAction,
  PredictAction,
  FillBlankAction,
  PulseCheckAction,
} from "@/types/whiteboard";
import styles from "./whiteboard-canvas-noir.module.css";

type Props = {
  steps: WhiteboardStep[];
  visibleStepIds: Set<number>;
  currentStepIndex: number;
  stepProgress: number;
  equalScaleCoords?: boolean;
  /** Accepted for parity with WhiteboardCanvas (this theatrical reskin
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

// ── Matrix-rain ambient field ─────────────────────────────────────
//
// A drifting cloud of small math glyphs. When a hero equation
// renders, each of its atoms "harvests" the nearest ambient glyph
// that matches its character — that donor fades out and the atom
// flies from the donor's position to its final spot, scaling up.
// Consumed donors respawn elsewhere after a delay so the field
// stays populated.

type MatrixGlyph = {
  id: number;
  char: string;
  x: number; // percent
  y: number; // percent
  driftSeed: number;
  driftDur: number;     // seconds — drift cycle length
  dx: number;           // px — horizontal drift amplitude
  dy: number;           // px — vertical drift amplitude
  rot: number;          // deg — rotation amplitude
  scaleAmp: number;     // multiplier max for scale (e.g. 1.12)
  twinkleSeed: number;  // seconds — independent opacity-pulse offset
  twinkleDur: number;   // seconds — opacity-pulse period
  size: "small" | "large"; // small (~13px) or large (~60–90px) variant
  fontPx: number;       // resolved px font-size
  consumed: boolean;
};

const MATRIX_ALPHABET =
  "0123456789xyznmabckdtπθλ+−=÷×()<>≤≥√∑∫".split("");
const MATRIX_GLYPH_COUNT = 96;

type MatrixConsumer = (
  char: string,
  near: { x: number; y: number },
) => DOMRect | null;

const MatrixContext = createContext<MatrixConsumer>(() => null);

function pickAlphabetChar(): string {
  return MATRIX_ALPHABET[
    Math.floor(Math.random() * MATRIX_ALPHABET.length)
  ];
}

function makeGlyph(id: number): MatrixGlyph {
  const isLarge = Math.random() < 0.16;
  const driftDur = isLarge
    ? 18 + Math.random() * 18 // large: 18–36s, slower
    : 8 + Math.random() * 14; // small: 8–22s
  const fontPx = isLarge
    ? 60 + Math.random() * 32 // 60–92px
    : 13;
  return {
    id,
    char: pickAlphabetChar(),
    x: Math.random() * 100,
    y: Math.random() * 100,
    driftSeed: Math.random() * driftDur,
    driftDur,
    dx: (Math.random() * 2 - 1) * (isLarge ? 56 : 32),
    dy: (Math.random() * 2 - 1) * (isLarge ? 56 : 32),
    rot: (Math.random() * 2 - 1) * (isLarge ? 14 : 9),
    scaleAmp: isLarge ? 0.94 + Math.random() * 0.16 : 0.88 + Math.random() * 0.28,
    twinkleSeed: Math.random() * 6,
    twinkleDur: isLarge
      ? 6 + Math.random() * 8 // large twinkle is slower
      : 3 + Math.random() * 5,
    size: isLarge ? "large" : "small",
    fontPx,
    consumed: false,
  };
}

function useMatrixField(): {
  glyphs: MatrixGlyph[];
  consume: MatrixConsumer;
  registerEl: (id: number, el: HTMLElement | null) => void;
} {
  const [glyphs, setGlyphs] = useState<MatrixGlyph[]>(() =>
    Array.from({ length: MATRIX_GLYPH_COUNT }, (_, i) => makeGlyph(i)),
  );
  const elsRef = useRef<Map<number, HTMLElement>>(new Map());
  const respawnTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const registerEl = useCallback((id: number, el: HTMLElement | null) => {
    if (el) elsRef.current.set(id, el);
    else elsRef.current.delete(id);
  }, []);

  const consume = useCallback<MatrixConsumer>((char, near) => {
    let bestId: number | null = null;
    let bestDist = Infinity;
    let bestRect: DOMRect | null = null;

    elsRef.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      // Skip donors whose DOM node is hidden or zero-sized.
      if (r.width === 0 && r.height === 0) return;
      // Skip already-consumed (their classlist carries the marker).
      if (el.dataset.consumed === "1") return;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let d = Math.hypot(cx - near.x, cy - near.y);
      // Strongly prefer same-character donors (multiplicative weight).
      if (el.dataset.glyph === char) d *= 0.35;
      if (d < bestDist) {
        bestDist = d;
        bestId = id;
        bestRect = r;
      }
    });

    if (bestId == null || !bestRect) return null;
    const id = bestId;
    const el = elsRef.current.get(id);
    if (el) el.dataset.consumed = "1";
    // Schedule respawn at a fresh location with a fresh char.
    const existing = respawnTimers.current.get(id);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      respawnTimers.current.delete(id);
      setGlyphs((prev) =>
        prev.map((g) => (g.id === id ? makeGlyph(id) : g)),
      );
      const respawned = elsRef.current.get(id);
      if (respawned) respawned.dataset.consumed = "0";
    }, 1800 + Math.random() * 1200);
    respawnTimers.current.set(id, t);
    return bestRect;
  }, []);

  useEffect(() => {
    return () => {
      respawnTimers.current.forEach((t) => clearTimeout(t));
      respawnTimers.current.clear();
    };
  }, []);

  return { glyphs, consume, registerEl };
}

function MatrixField({
  glyphs,
  registerEl,
}: {
  glyphs: MatrixGlyph[];
  registerEl: (id: number, el: HTMLElement | null) => void;
}) {
  return (
    <div className={styles.matrixField} aria-hidden="true">
      {glyphs.map((g) => (
        <span
          key={g.id}
          className={styles.matrixGlyph}
          data-glyph={g.char}
          data-consumed="0"
          data-size={g.size}
          ref={(el) => registerEl(g.id, el)}
          style={
            {
              left: `${g.x}%`,
              top: `${g.y}%`,
              fontSize: `${g.fontPx}px`,
              "--m-dx": `${g.dx}px`,
              "--m-dy": `${g.dy}px`,
              "--m-rot": `${g.rot}deg`,
              "--m-scale": String(g.scaleAmp),
              "--m-drift-dur": `${g.driftDur}s`,
              "--m-drift-delay": `${-g.driftSeed}s`,
              "--m-twinkle-dur": `${g.twinkleDur}s`,
              "--m-twinkle-delay": `${-g.twinkleSeed}s`,
            } as CSSProperties
          }
        >
          {g.char}
        </span>
      ))}
    </div>
  );
}

/** Cinematic v2 whiteboard. A standalone renderer (not a wrapper around
 *  the v1 canvas) — owns its own visual language. Activated via
 *  ?debug=v2 on the SAT micro-lesson route. */
export function WhiteboardCanvasNoir({
  steps,
  visibleStepIds,
  currentStepIndex,
}: Props) {
  const matrix = useMatrixField();
  const visibleSteps = useMemo(
    () => steps.filter((s) => visibleStepIds.has(s.id)),
    [steps, visibleStepIds],
  );

  const heroStep =
    visibleSteps[Math.min(currentStepIndex, visibleSteps.length - 1)] ??
    visibleSteps[visibleSteps.length - 1] ??
    null;

  const totalCount = steps.length || 1;
  const currentNumber = Math.min(currentStepIndex + 1, totalCount);

  const trail = useMemo(() => {
    const heroId = heroStep?.id;
    return visibleSteps
      .filter((s) => s.id !== heroId)
      .filter((s) => isMathLike(s.action))
      .slice(-4)
      .reverse();
  }, [visibleSteps, heroStep]);

  const sectionHeading = pickRecentSectionHeading(visibleSteps, heroStep?.id);
  const activeCallout = pickActiveCallout(heroStep);

  return (
    <MatrixContext.Provider value={matrix.consume}>
    <div className={styles.theatre} data-canvas="noir-v2">
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.starfield} aria-hidden="true" />
      <div className={styles.scanline} aria-hidden="true" />

      <MatrixField glyphs={matrix.glyphs} registerEl={matrix.registerEl} />
      <FloorGrid />
      <Constellation />
      <OrbitalRing />
      <VectorField />

      {/* Top bar — eyebrow + step counter */}
      <div className={styles.topBar}>
        <div className={styles.topEyebrow}>
          <span className={styles.eyeDot} />
          <span>ATHENA · WORKING SURFACE</span>
        </div>
        <div className={styles.topStepBadge}>
          <span className={styles.badgeNum}>
            {String(currentNumber).padStart(2, "0")}
          </span>
          <span className={styles.badgeSep}>/</span>
          <span className={styles.badgeTotal}>
            {String(totalCount).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Step ledger — vertical reel on the left */}
      <StepLedger
        total={totalCount}
        current={currentStepIndex}
        visibleCount={visibleSteps.length}
      />

      {/* Section-heading banner */}
      <AnimatePresence>
        {sectionHeading ? (
          <motion.div
            key={`sh-${sectionHeading.id}`}
            className={styles.sectionBanner}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <span className={styles.sectionRule} />
            <span className={styles.sectionTitle}>
              <MathText
                text={(sectionHeading.action as SectionHeadingAction).text}
              />
            </span>
            {(sectionHeading.action as SectionHeadingAction).subtitle ? (
              <span className={styles.sectionSubtitle}>
                ·{" "}
                <MathText
                  text={
                    (sectionHeading.action as SectionHeadingAction).subtitle ?? ""
                  }
                />
              </span>
            ) : null}
            <span className={styles.sectionRule} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Hero stage — the protagonist */}
      <div className={styles.stage}>
        <AnimatePresence mode="wait">
          {heroStep ? (
            <motion.div
              key={`hero-${heroStep.id}`}
              className={styles.hero}
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.03, filter: "blur(6px)" }}
              transition={{ duration: 0.45, ease: [0.4, 0, 0.6, 1] }}
            >
              <HeroContent step={heroStep} />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Underglow line — the "axis" the hero rests on */}
        <motion.div
          className={styles.heroAxis}
          key={`axis-${heroStep?.id ?? "x"}`}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 0.7 }}
          transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 }}
        />
      </div>

      {/* Trail — recent prior steps fading down the right side */}
      {trail.length > 0 ? (
        <div className={styles.trail}>
          <div className={styles.trailLabel}>Prior</div>
          {trail.map((s, i) => (
            <div
              key={s.id}
              className={styles.trailRow}
              style={{ opacity: Math.max(0.18, 0.85 - i * 0.18) }}
            >
              <span className={styles.trailIdx}>
                {String(s.id).padStart(2, "0")}
              </span>
              <TrailMath step={s} />
            </div>
          ))}
        </div>
      ) : null}

      {/* Active callout — slides in beside the hero */}
      <AnimatePresence>
        {activeCallout ? (
          <motion.div
            key={`callout-${heroStep?.id ?? "x"}`}
            className={styles.callout}
            data-variant={activeCallout.variant}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className={styles.calloutEyebrow}>
              {activeCallout.eyebrow ?? defaultEyebrow(activeCallout.variant)}
            </div>
            <CalloutBody body={activeCallout.body} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Bottom — narration / display caption */}
      <div className={styles.captionRow}>
        <AnimatePresence mode="wait">
          {heroStep?.displayText || heroStep?.narration ? (
            <motion.div
              key={`cap-${heroStep.id}`}
              className={styles.caption}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.4 }}
            >
              <MathText
                text={
                  heroStep.displayText ?? truncate(heroStep.narration ?? "", 160)
                }
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Corner registration marks */}
      <span className={`${styles.cornerMark} ${styles.tl}`} aria-hidden>
        N° 01
      </span>
      <span className={`${styles.cornerMark} ${styles.tr}`} aria-hidden>
        v2 · cinematic
      </span>
      <span className={`${styles.cornerMark} ${styles.bl}`} aria-hidden>
        ░ ░ ░ ░ ░ ░ ░ ░
      </span>
      <span className={`${styles.cornerMark} ${styles.br}`} aria-hidden>
        rec · {new Date().getUTCFullYear()}
      </span>
    </div>
    </MatrixContext.Provider>
  );
}

// ── Hero content router ──────────────────────────────────────────

function HeroContent({ step }: { step: WhiteboardStep }) {
  const a = step.action;
  switch (a.type) {
    case "write_math":
      return <HeroMath latex={a.latex} />;
    case "write_text":
      return <HeroText text={a.text} />;
    case "section_heading":
      return (
        <HeroText
          text={
            a.subtitle ? `${a.text}\n${a.subtitle}` : a.text
          }
          dramatic
        />
      );
    case "callout":
      // Callout is rendered as a side panel; if it's the only thing,
      // treat its body as the hero.
      return <HeroText text={(a as CalloutAction).body} />;
    case "check_in":
      return <HeroMath latex={(a as CheckInAction).question} />;
    case "predict":
      return <HeroMath latex={(a as PredictAction).question} />;
    case "fill_blank": {
      const fb = a as FillBlankAction;
      return <HeroMath latex={fb.prompt ?? fb.question ?? ""} />;
    }
    case "pulse_check":
      return <HeroMath latex={(a as PulseCheckAction).question} />;
    default:
      return <HeroText text={step.displayText ?? `[${a.type}]`} />;
  }
}

function HeroMath({ latex }: { latex: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const consume = useContext(MatrixContext);
  useEffect(() => {
    if (!ref.current) return;
    const container = ref.current;
    try {
      katex.render(latex, container, {
        throwOnError: false,
        displayMode: true,
        trust: true,
        strict: "ignore",
      });
      // ── Matrix-harvest fly-in ───────────────────────────────────
      // For each visible KaTeX atom (top-level children of each .base,
      // minus struts/spaces), find the nearest matching glyph in the
      // Matrix-rain ambient field. Animate the atom from the donor's
      // current position + small ambient size up to its full final
      // position + size, glowing during the flight.
      const bases = container.querySelectorAll(".katex-html .base");
      const atoms: HTMLElement[] = [];
      bases.forEach((base) => {
        Array.from(base.children).forEach((kid) => {
          if (!(kid instanceof HTMLElement)) return;
          if (kid.classList.contains("strut")) return;
          if (kid.classList.contains("mspace")) return;
          atoms.push(kid);
        });
      });

      const order = atoms.map((_, i) => i);
      // Light shuffle so the assembly doesn't feel strictly L→R
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }

      const containerRect = container.getBoundingClientRect();
      atoms.forEach((atom, i) => {
        const atomRect = atom.getBoundingClientRect();
        const atomCx = atomRect.left + atomRect.width / 2;
        const atomCy = atomRect.top + atomRect.height / 2;

        // Heuristic char to match against ambient field.
        // Strip whitespace; KaTeX often renders multi-char tokens
        // (e.g. "f", "x"), use first non-space char as the match key.
        const text = (atom.textContent ?? "").trim();
        const charKey = text.length > 0 ? text[0] : "";

        const donor = charKey
          ? consume(charKey, { x: atomCx, y: atomCy })
          : null;

        let tx: number;
        let ty: number;
        let scale: number;

        if (donor) {
          const donorCx = donor.left + donor.width / 2;
          const donorCy = donor.top + donor.height / 2;
          tx = donorCx - atomCx;
          ty = donorCy - atomCy;
          // Donor-relative scale: the atom emerges at the donor's
          // apparent size and resolves to its final size during the
          // travel. Small donors (~13px) → atom GROWS (scale < 1);
          // large donors (~80px) → atom SHRINKS (scale > 1). Clamped
          // wider than just-grow so both directions are expressive.
          scale = Math.max(
            0.15,
            Math.min(2.0, donor.height / atomRect.height),
          );
        } else {
          // Fallback: outward scatter from equation centerline (used
          // only if the matrix field couldn't produce a donor).
          const cx = atomCx - (containerRect.left + containerRect.width / 2);
          const cy = atomCy - (containerRect.top + containerRect.height / 2);
          const len = Math.hypot(cx, cy) || 1;
          const dist = 240 + Math.random() * 240;
          tx = (cx / len) * dist;
          ty = (cy / len) * dist;
          scale = 0.35;
        }

        const stagger = order.indexOf(i) * 55 + Math.random() * 90;
        atom.style.setProperty("--fly-tx", `${tx}px`);
        atom.style.setProperty("--fly-ty", `${ty}px`);
        atom.style.setProperty("--fly-rot", "0deg");
        atom.style.setProperty("--fly-scale", String(scale));
        atom.style.animationDelay = `${stagger}ms`;
        atom.classList.add("noir-fly");
      });
    } catch {
      if (ref.current) ref.current.textContent = latex;
    }
  }, [latex, consume]);
  return <div ref={ref} className={styles.heroMath} />;
}

function HeroText({ text, dramatic }: { text: string; dramatic?: boolean }) {
  return (
    <div className={dramatic ? styles.heroDramatic : styles.heroText}>
      {text.split("\n").map((line, i) => (
        <span key={i} className={styles.heroLine}>
          <MathText text={line} />
        </span>
      ))}
    </div>
  );
}

/** Renders text with `$...$` segments parsed through KaTeX inline.
 *  Used everywhere prose may carry inline math (narration, displayText,
 *  section headings, callouts, write_text). */
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

function TrailMath({ step }: { step: WhiteboardStep }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const a = step.action;
  const latex = a.type === "write_math" ? a.latex : null;
  useEffect(() => {
    if (!ref.current || !latex) return;
    try {
      katex.render(latex, ref.current, {
        throwOnError: false,
        displayMode: false,
        trust: true,
        strict: "ignore",
      });
    } catch {
      if (ref.current) ref.current.textContent = latex;
    }
  }, [latex]);
  if (latex) return <div ref={ref} className={styles.trailMath} />;
  if (a.type === "write_text") {
    return (
      <div className={styles.trailMath}>
        <MathText text={truncate(a.text, 80)} />
      </div>
    );
  }
  return <div className={styles.trailMath}>[{a.type}]</div>;
}

function CalloutBody({ body }: { body: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    el.innerHTML = "";
    const parts = body.split(/(\$[^$]*\$)/g);
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
          span.textContent = part;
        }
        el.appendChild(span);
      } else if (part) {
        const t = document.createElement("span");
        t.textContent = part;
        el.appendChild(t);
      }
    }
  }, [body]);
  return <div ref={ref} className={styles.calloutBody} />;
}

// ── Decorative scenery ───────────────────────────────────────────

function FloorGrid() {
  return (
    <div className={styles.floor} aria-hidden="true">
      <div className={styles.floorPlane} />
      <div className={styles.horizon} />
    </div>
  );
}

function Constellation() {
  // 18 randomized but deterministic dots in the upper half
  const dots = useMemo(() => {
    const seed = 7;
    const rng = mulberry32(seed);
    return Array.from({ length: 18 }, () => ({
      x: 6 + rng() * 88,
      y: 4 + rng() * 36,
      r: 0.8 + rng() * 1.4,
      o: 0.25 + rng() * 0.5,
    }));
  }, []);
  return (
    <svg className={styles.constellation} aria-hidden="true">
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={`${d.x}%`}
          cy={`${d.y}%`}
          r={d.r}
          fill="oklch(0.92 0.04 60)"
          opacity={d.o}
        />
      ))}
    </svg>
  );
}

function OrbitalRing() {
  return (
    <svg className={styles.orbital} aria-hidden="true" viewBox="-100 -100 200 200">
      <circle r="92" className={styles.ringOuter} />
      <circle r="68" className={styles.ringMid} />
      <circle r="44" className={styles.ringInner} />
      <g className={styles.ringTicks}>
        {Array.from({ length: 24 }, (_, i) => {
          const a = (i / 24) * Math.PI * 2;
          const r1 = 88;
          const r2 = i % 6 === 0 ? 78 : 84;
          const x1 = Math.cos(a) * r1;
          const y1 = Math.sin(a) * r1;
          const x2 = Math.cos(a) * r2;
          const y2 = Math.sin(a) * r2;
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
          );
        })}
      </g>
      <circle r="2" className={styles.ringCore} />
    </svg>
  );
}

function VectorField() {
  // Faint upward arrows scattered along the floor area
  const cells = useMemo(() => {
    const out: { x: number; y: number; rot: number; len: number }[] = [];
    const rng = mulberry32(13);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 8; col++) {
        const x = 8 + col * 11 + (rng() - 0.5) * 4;
        const y = 60 + row * 9 + (rng() - 0.5) * 3;
        const rot = -90 + (rng() - 0.5) * 50;
        const len = 8 + rng() * 6;
        out.push({ x, y, rot, len });
      }
    }
    return out;
  }, []);
  return (
    <svg className={styles.vectorField} aria-hidden="true">
      <defs>
        <marker
          id="noir-arrowhead"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L5,3 L0,6 z" fill="oklch(0.78 0.16 55 / 0.5)" />
        </marker>
      </defs>
      {cells.map((c, i) => {
        const x1 = c.x;
        const y1 = c.y;
        const dx = Math.cos((c.rot * Math.PI) / 180) * c.len * 0.1;
        const dy = Math.sin((c.rot * Math.PI) / 180) * c.len * 0.1;
        return (
          <line
            key={i}
            x1={`${x1}%`}
            y1={`${y1}%`}
            x2={`${x1 + dx}%`}
            y2={`${y1 + dy}%`}
            stroke="oklch(0.78 0.16 55 / 0.35)"
            strokeWidth="1"
            markerEnd="url(#noir-arrowhead)"
          />
        );
      })}
    </svg>
  );
}

// ── Step ledger ──────────────────────────────────────────────────

function StepLedger({
  total,
  current,
  visibleCount,
}: {
  total: number;
  current: number;
  visibleCount: number;
}) {
  // Show up to 14 ticks; window slides as `current` advances.
  const window = 14;
  const start = Math.max(0, Math.min(total - window, current - 6));
  const end = Math.min(total, start + window);
  const ticks = Array.from({ length: end - start }, (_, i) => start + i);
  return (
    <div className={styles.ledger}>
      <div className={styles.ledgerLabel}>Reel</div>
      <div className={styles.ledgerList}>
        {ticks.map((idx) => {
          const seen = idx < visibleCount;
          const active = idx === current;
          return (
            <div
              key={idx}
              className={`${styles.tick} ${active ? styles.tickActive : ""} ${
                seen ? styles.tickSeen : ""
              }`}
            >
              <span className={styles.tickRule} />
              <span className={styles.tickNum}>
                {String(idx + 1).padStart(2, "0")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function isMathLike(a: WhiteboardAction): boolean {
  return a.type === "write_math" || a.type === "write_text";
}

function pickRecentSectionHeading(
  steps: WhiteboardStep[],
  excludeId?: number,
): WhiteboardStep | null {
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (s.id === excludeId) continue;
    if (s.action.type === "section_heading") return s;
    // Only consider very recent (last 1) so it doesn't linger
    break;
  }
  return null;
}

function pickActiveCallout(step: WhiteboardStep | null): CalloutAction | null {
  if (!step) return null;
  if (step.action.type === "callout") return step.action as CalloutAction;
  return null;
}

function defaultEyebrow(variant: CalloutAction["variant"]): string {
  switch (variant) {
    case "hint":
      return "HINT";
    case "detailed-hint":
      return "DETAILED HINT";
    case "answer-correct":
      return "CORRECT";
    case "answer-incorrect":
      return "REVIEW";
    default:
      return "NOTE";
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
