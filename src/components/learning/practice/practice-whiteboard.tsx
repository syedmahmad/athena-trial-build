"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";

// ── Canvas-overlay confetti (mirrors CheckInConfetti in micro-lesson.tsx) ──
// Visually identical so the practice-quiz feedback feels continuous with
// the in-lesson check-in / predict / fill_blank pulses.

export function CorrectConfetti() {
  const colors = [
    "hsl(var(--green))",
    "hsl(var(--blue))",
    "hsl(var(--yellow))",
    "hsl(var(--pink))",
    "hsl(var(--orange))",
  ];
  const particles = Array.from({ length: 14 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 0.4,
    size: 3 + Math.random() * 3,
    color: colors[i % colors.length],
  }));
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            bottom: "30%",
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
          }}
          initial={{ y: 0, opacity: 1 }}
          animate={{
            y: -180 - Math.random() * 120,
            opacity: [1, 1, 0],
            x: (Math.random() - 0.5) * 80,
          }}
          transition={{
            duration: 1.2 + Math.random() * 0.4,
            delay: p.delay,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}
import type { WhiteboardStep } from "@/types/whiteboard";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MathContent } from "@/components/quiz/math-content";
import { ObservationFrame } from "@/components/learning/observation/observation-frame";
import { ObservationOrb } from "@/components/learning/observation/observation-orb";
import { PresenceLayer } from "@/components/learning/observation/presence-layer";
import { IsoContourFrame } from "@/components/learning/observation/iso-contour-frame";
import { WhiteboardCanvas } from "@/components/whiteboard/whiteboard-canvas";
import { MobileLessonRenderer } from "@/components/whiteboard/mobile/mobile-lesson-renderer";
import { useLessonViewport } from "@/hooks/use-lesson-viewport";
import type { StepFocus } from "@/components/whiteboard/pen-tip";
import { useSearchParams } from "next/navigation";
import { useSound } from "@/hooks/useSound";
import { useQuestionNarration, stripTtsNoise } from "@/hooks/use-question-narration";
import type { Problem } from "@/components/quiz/types";

/**
 * Practice problem surface that mirrors the micro-lesson aesthetic:
 *   - Observation-record chrome (orb + caption + canvas + bottom pane)
 *   - Question visual rendered on a `WhiteboardCanvas`. If the problem
 *     ships `whiteboardSteps` (future-proof), those play. Otherwise we
 *     synthesize a single-step canvas that displays the question text /
 *     equation as a centered `write_math` (or `write_text`) row.
 *   - Hints surface under the orb as the transient caption — they do
 *     NOT render as inline coloured callouts on the option grid and
 *     they do NOT render as canvas-callout steps. This matches the
 *     in-lesson interaction behaviour (predict / fill_blank).
 *   - Answer options live in a flat bottom pane styled exactly like
 *     the micro-lesson's bottom interaction pane (border-t,
 *     obs-surface bg, max-width 720px, 2-column grid at gap-1.5).
 *
 * Three exports:
 *
 *   <PracticeWhiteboard … />          full-screen, wraps in
 *                                     ObservationFrame (the chrome).
 *
 *   <PracticeWhiteboardContent … />   inner body only — for use INSIDE
 *                                     a parent that already mounts
 *                                     ObservationFrame. Skips the frame.
 *
 *   <PracticePane … />                bare pane — header + options +
 *                                     reveal feedback. No canvas, no
 *                                     orb, no internal TTS. For use
 *                                     inside the micro-lesson where the
 *                                     lesson already owns the canvas
 *                                     and the orb caption.
 *
 *   synthesizeQuestionStep(problem)   helper that returns a single
 *                                     write_math / write_text step
 *                                     suitable for piping into the
 *                                     lesson's existing canvas.
 */

export type PracticePhase = "answering" | "hinted" | "detailed" | "revealed";

/**
 * Problem objects coming from the practice-problems API today don't carry
 * `whiteboardSteps`, but the prompt-driven generator may add them in the
 * future. Accept the field as optional and fall through to the synthesized
 * single-step canvas when it's absent.
 */
export type ProblemWithMaybeSteps = Problem & {
  whiteboardSteps?: WhiteboardStep[];
};

// ── Helpers ───────────────────────────────────────────────────────────────

// `stripTtsNoise` and `playNarration` moved to the shared
// `useQuestionNarration` hook so PracticePane (used by tutor-practice-card)
// and PracticeWhiteboardContent (used by post-lesson practice) can both
// read the question aloud. Re-exported below for synthesizeQuestionStep
// callers that depend on the local symbol.

/**
 * Build a one-step whiteboard "scene" from a Problem when the problem
 * doesn't already ship full whiteboardSteps. We try to identify whether
 * the question text is mostly math (a single $...$ block) so we can
 * render via write_math; otherwise we fall back to write_text.
 */
export function synthesizeQuestionStep(
  problem: Problem,
  startId = 0,
): WhiteboardStep[] {
  const raw = (problem.questionText || "").trim();
  if (!raw) return [];

  const fullMath = /^\$([^$]+)\$$/.exec(raw);
  if (fullMath) {
    return [
      {
        id: startId,
        delayMs: 0,
        durationMs: 400,
        action: {
          type: "write_math",
          latex: fullMath[1],
        },
      } as WhiteboardStep,
    ];
  }

  // Mixed prose-with-math: convert to a single LaTeX string with
  // `\text{}` segments wrapping the prose so KaTeX renders math
  // fragments (e.g. $L_1$) properly while plain text reads as plain
  // text. Sentence boundaries are split with `\\` so KaTeX wraps
  // long questions across multiple display rows instead of overflowing
  // off the right edge / scaling to illegibility.
  const hasMath = /\$[^$]+\$/.test(raw);
  if (hasMath) {
    return [
      {
        id: startId,
        delayMs: 0,
        durationMs: 400,
        action: {
          type: "write_math",
          latex: questionTextToLatex(raw),
        },
      } as WhiteboardStep,
    ];
  }

  // Pure prose — wb-write-text handles multi-line wrapping cleanly.
  return [
    {
      id: startId,
      delayMs: 0,
      durationMs: 400,
      action: {
        type: "write_text",
        text: raw,
      },
    } as WhiteboardStep,
  ];
}

/** Convert a question string with embedded `$...$` math fragments to a
 *  single LaTeX expression suitable for a `write_math` step. Plain text
 *  is wrapped in `\text{}`; math fragments are emitted as raw LaTeX.
 *  Sentence breaks are inserted as `\\` so KaTeX wraps long questions
 *  rather than overflowing the canvas. */
function questionTextToLatex(text: string): string {
  // Escape characters that have special meaning inside KaTeX `\text{}`.
  // Order matters — the backslash replacement has to come first so we
  // don't double-escape the backslashes the other replacements emit.
  const escapePlain = (s: string) =>
    s
      .replace(/\\/g, "\\textbackslash ")
      .replace(/\{/g, "\\{")
      .replace(/\}/g, "\\}")
      .replace(/\$/g, "\\$")
      .replace(/&/g, "\\&")
      .replace(/%/g, "\\%")
      .replace(/#/g, "\\#")
      .replace(/_/g, "\\_")
      .replace(/\^/g, "\\^{}");

  const renderSegment = (segment: string): string => {
    const parts = segment.split(/(\$[^$]+\$)/g);
    return parts
      .map((p) => {
        const m = /^\$(.+)\$$/.exec(p);
        if (m) return m[1];
        if (!p) return "";
        return `\\text{${escapePlain(p)}}`;
      })
      .join("");
  };

  // Split on sentence boundaries (period / question mark / exclamation
  // followed by whitespace) so KaTeX renders multiple lines.
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.map(renderSegment).filter(Boolean).join(" \\\\[6pt] ");
}

// ── Options grid (the 2-col answer button strip) ──────────────────────────

type OptionsGridProps = {
  problem: Problem;
  selected: number | null;
  wrongIndices: Set<number>;
  isRevealed: boolean;
  onSelect: (index: number) => void;
};

function OptionsGrid({
  problem,
  selected,
  wrongIndices,
  isRevealed,
  onSelect,
}: OptionsGridProps) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {problem.options.map((option, i) => {
        const isThis = selected === i;
        const isRight = i === problem.correctOption;
        const isWrong = wrongIndices.has(i);

        return (
          <button
            key={i}
            onClick={() => onSelect(i)}
            disabled={isRevealed || isWrong}
            className={cn(
              "flex w-full items-start gap-2.5 rounded-lg border border-[var(--obs-border)] bg-[var(--obs-bg)]/30 px-3 py-2 text-left text-sm text-[var(--obs-fg)] transition-colors",
              !isRevealed &&
                !isWrong &&
                "hover:bg-[var(--obs-surface)] hover:border-[var(--obs-glow-mid)]/50 cursor-pointer",
              isRevealed && isRight && "border-green-500 bg-green-500/10",
              isRevealed && isThis && !isRight && "border-red-500 bg-red-500/10",
              isRevealed && !isThis && !isRight && "opacity-50",
              isWrong &&
                !isRevealed &&
                "border-red-500/50 bg-red-500/5 opacity-60",
            )}
            style={
              isRevealed && isRight
                ? { boxShadow: "0 0 12px rgba(34, 197, 94, 0.3)" }
                : undefined
            }
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-xs font-medium mt-0.5 text-[var(--obs-muted)]",
                isRevealed &&
                  isRight &&
                  "border-green-500 bg-green-500 text-white",
                ((isRevealed && isThis && !isRight) || isWrong) &&
                  "border-red-500 bg-red-500 text-white",
              )}
            >
              {isRevealed && isRight ? (
                <Check className="h-3 w-3" />
              ) : (isRevealed && isThis && !isRight) || isWrong ? (
                <X className="h-3 w-3" />
              ) : (
                String.fromCharCode(65 + i)
              )}
            </span>
            <span className="flex-1 leading-relaxed">
              <MathContent content={option} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Bare pane (header + options + reveal feedback) ────────────────────────

/** Pane state captured for back/forward navigation. The parent stores a
 *  Map<problemIndex, PracticePaneSavedState> and re-hydrates the pane
 *  whenever the student navigates to a previously-visited problem.
 *  `problemId` is included so the parent can defensively skip stale
 *  entries if the underlying problem at that index ever changes
 *  (today: rare, but the cost of the check is trivial). */
export type PracticePaneSavedState = {
  problemId: Problem["id"];
  phase: PracticePhase;
  selected: number | null;
  /** Set serialized as an array — Maps and Sets aren't structurally
   *  comparable, so the parent stores plain data and the pane reconstructs
   *  the Set on rehydration. */
  wrongIndices: number[];
};

type PracticePaneProps = {
  problem: ProblemWithMaybeSteps;
  questionNumber: number;
  totalProblems?: number;
  onCorrect: () => void;
  onExhausted: () => void;
  onWrong?: () => void;
  /** Fires when the phase machine advances. Lets parents drive their
   *  own caption / TTS plumbing (e.g. the micro-lesson's lesson-level
   *  orb caption). Suppresses the inline "Got it, continue" affordance
   *  too — the parent owns the flow. */
  onHintPhaseChange?: (phase: PracticePhase) => void;
  /** Fires once when the student selects the correct answer (before
   *  auto-advance). Lets a parent surface the "Correct!" pulse on the
   *  whiteboard canvas instead of inside the bottom interaction pane.
   *  When set, the inline "Correct!" affordance in the pane is
   *  suppressed so the visual feedback isn't double-rendered. */
  onRevealedCorrect?: () => void;
  /** When true, hides the inline "Got it, continue" button so the
   *  parent (e.g. micro-lesson with auto-advance) controls advancement
   *  on its own timer. The auto-advance timer in the pane still fires. */
  hideContinueAffordance?: boolean;
  /** Render the question text inside the pane in addition to (or
   *  instead of) the canvas. Default `false` — the canvas shows the
   *  question. Set `true` for compact / no-canvas surfaces. */
  showQuestionInPane?: boolean;
  // ── Back/forward navigation ──
  /** Callback invoked when the student presses the "Prev" button.
   *  When omitted, the Prev button doesn't render. */
  onPrev?: () => void;
  /** Callback invoked when the student presses the "Next" button.
   *  When omitted, the Next button doesn't render. */
  onNext?: () => void;
  /** Whether the Prev button should be enabled (true) or disabled. */
  canGoPrev?: boolean;
  /** Whether the Next button should be enabled (true) or disabled. */
  canGoNext?: boolean;
  /** When provided, the pane mounts with this prior state — e.g. the
   *  student navigated back to a previously-attempted problem. If the
   *  saved phase was terminal ("revealed"), auto-advance is suppressed
   *  so going back doesn't immediately bounce them forward again. */
  savedState?: PracticePaneSavedState;
  /** Fires whenever the pane's internal state mutates. Used by the
   *  parent to keep its history map in sync so a Prev click can save
   *  the current state before navigating away. */
  onStateChange?: (state: PracticePaneSavedState) => void;
};

export function PracticePane({
  problem,
  questionNumber,
  totalProblems,
  onCorrect,
  onExhausted,
  onWrong,
  onHintPhaseChange,
  onRevealedCorrect,
  hideContinueAffordance = false,
  showQuestionInPane = false,
  onPrev,
  onNext,
  canGoPrev = false,
  canGoNext = false,
  savedState,
  onStateChange,
}: PracticePaneProps) {
  // Initialize from savedState if the parent is rehydrating a
  // previously-visited problem; otherwise start fresh.
  const [phase, setPhase] = useState<PracticePhase>(
    savedState?.phase ?? "answering",
  );
  const [selected, setSelected] = useState<number | null>(
    savedState?.selected ?? null,
  );
  const [wrongIndices, setWrongIndices] = useState<Set<number>>(
    () => new Set(savedState?.wrongIndices ?? []),
  );
  // Suppress auto-advance ONLY when we mounted at a terminal saved
  // state. Without this, going back to a completed problem would bounce
  // the student forward again 1-2.5s later via the auto-advance timer.
  // Tracked as state (not ref) so the value used by the auto-advance
  // effect is always the one captured at the most recent problem mount.
  const [suppressAutoAdvance, setSuppressAutoAdvance] = useState(
    savedState?.phase === "revealed",
  );
  // Track the last-seen problem.id in state (not a ref) so the official
  // "reset state when prop changes during render" pattern from
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  // applies cleanly under the strict react-hooks/refs lint rule.
  const [lastProblemId, setLastProblemId] = useState(problem.id);
  // `advanced` is a one-shot latch for the auto-advance timer. It only
  // ever flips false→true within a single problem lifetime, so a ref is
  // a better fit than state — flipping it doesn't need to schedule a
  // re-render. The ref is only touched inside an effect, which is
  // permitted by react-hooks/refs.
  const advancedRef = useRef(false);
  const sound = useSound();

  if (lastProblemId !== problem.id) {
    setLastProblemId(problem.id);
    setPhase(savedState?.phase ?? "answering");
    setSelected(savedState?.selected ?? null);
    setWrongIndices(new Set(savedState?.wrongIndices ?? []));
    setSuppressAutoAdvance(savedState?.phase === "revealed");
  }

  // Mirror internal state up to the parent so it can keep a history map
  // for back/forward navigation. Only fires when something actually
  // changes (useEffect deps), so navigating Prev/Next won't loop.
  useEffect(() => {
    onStateChange?.({
      problemId: problem.id,
      phase,
      selected,
      wrongIndices: Array.from(wrongIndices),
    });
  }, [problem.id, phase, selected, wrongIndices, onStateChange]);

  // Forward phase to parent. Use a state holder rather than a ref so we
  // don't run afoul of the strict refs-in-render lint rule. The
  // forwarding effect runs once per phase change AND once whenever the
  // parent passes a new callback; that's marginally chattier than a
  // ref-based latch but functionally equivalent for our use case (the
  // parent's callback is itself stable when wrapped in useCallback).
  useEffect(() => {
    onHintPhaseChange?.(phase);
  }, [phase, onHintPhaseChange]);

  const isCorrect = selected === problem.correctOption;
  const isRevealed = phase === "revealed";

  // Reset the advance latch when the problem changes. Touching the ref
  // inside an effect is fine — the rule bans render-time access only.
  useEffect(() => {
    advancedRef.current = false;
  }, [lastProblemId]);

  // Auto-advance after reveal. The advance latch keeps strict-mode's
  // double-invoke from queuing two timers. Skipped entirely when we
  // mounted at a terminal saved state (back-nav rehydration) so the
  // student doesn't bounce forward immediately on Prev.
  useEffect(() => {
    if (!isRevealed || advancedRef.current || suppressAutoAdvance) return;
    advancedRef.current = true;
    const delay = isCorrect ? 1000 : 2500;
    const t = setTimeout(() => {
      if (isCorrect) onCorrect();
      else onExhausted();
    }, delay);
    return () => clearTimeout(t);
  }, [isRevealed, isCorrect, onCorrect, onExhausted, suppressAutoAdvance]);

  const handleSelect = useCallback(
    (index: number) => {
      if (isRevealed || wrongIndices.has(index)) return;
      setSelected(index);

      if (index === problem.correctOption) {
        sound.achievement();
        setPhase("revealed");
        onRevealedCorrect?.();
        return;
      }

      sound.wrong();
      setWrongIndices((prev) => {
        const next = new Set(prev);
        next.add(index);
        return next;
      });
      onWrong?.();

      setPhase((prev) => {
        if (prev === "answering" && problem.hint) return "hinted";
        if (prev === "hinted" && problem.detailedHint) return "detailed";
        return "revealed";
      });
    },
    [isRevealed, wrongIndices, problem, sound, onWrong, onRevealedCorrect],
  );

  // When a parent owns the canvas-level "Correct!" feedback, suppress
  // the inline pulse in the pane so the visual doesn't double-render.
  const suppressInlineCorrect = !!onRevealedCorrect;

  // Show nav buttons only when the parent wired the callbacks. Keeps
  // the bare PracticePane (used by tutor-practice-card) chrome-free.
  const showNavButtons = !!(onPrev || onNext);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {showNavButtons && onPrev ? (
          <button
            type="button"
            onClick={onPrev}
            disabled={!canGoPrev}
            aria-label="Previous problem"
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
              canGoPrev
                ? "text-[var(--obs-fg)] hover:bg-[var(--obs-surface)] cursor-pointer"
                : "text-[var(--obs-muted)]/40 cursor-not-allowed",
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : null}
        <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--obs-muted)]">
          Practice {questionNumber}
          {totalProblems ? ` of ${totalProblems}` : ""}
        </span>
        {totalProblems ? (
          <div className="flex-1 h-1 bg-[var(--obs-border)]/40 rounded-full overflow-hidden">
            {/* Plain <div> + CSS width transition. Was a motion.div with
                animate-width but no initial — framer-motion had to infer
                the mount-time width, which briefly read as the
                container's full width before resolving to the target,
                visibly flashing the bar full on first paint. */}
            <div
              className="h-full rounded-full bg-[var(--obs-accent)] transition-[width] duration-300"
              style={{
                width: `${((questionNumber - 1) / totalProblems) * 100}%`,
              }}
            />
          </div>
        ) : null}
        {showNavButtons && onNext ? (
          <button
            type="button"
            onClick={onNext}
            disabled={!canGoNext}
            aria-label="Next problem"
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
              canGoNext
                ? "text-[var(--obs-fg)] hover:bg-[var(--obs-surface)] cursor-pointer"
                : "text-[var(--obs-muted)]/40 cursor-not-allowed",
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {showQuestionInPane && (
        <div className="text-sm text-[var(--obs-fg)]">
          <MathContent content={problem.questionText} />
        </div>
      )}

      <OptionsGrid
        problem={problem}
        selected={selected}
        wrongIndices={wrongIndices}
        isRevealed={isRevealed}
        onSelect={handleSelect}
      />

      {isRevealed && isCorrect && !suppressInlineCorrect && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
          className="flex items-center gap-1.5 text-green-500"
        >
          <Check className="h-4 w-4" />
          <span className="text-sm font-bold">Correct!</span>
        </motion.div>
      )}

      {isRevealed && !isCorrect && !hideContinueAffordance && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-end"
        >
          <Button
            size="sm"
            variant="ghost"
            className="gap-1 text-xs text-[var(--obs-muted)] hover:text-[var(--obs-fg)]"
            onClick={onExhausted}
          >
            Got it, continue
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </motion.div>
      )}
    </div>
  );
}

// ── Inner content (canvas + orb + pane), no frame chrome ──────────────────

type ContentProps = {
  problem: ProblemWithMaybeSteps;
  questionNumber: number;
  totalProblems?: number;
  onCorrect: () => void;
  onExhausted: () => void;
  onWrong?: () => void;
  /** Forwarded to the inner pane. Useful when the parent wants to know
   *  the phase even though it's letting this component own the orb. */
  onHintPhaseChange?: (phase: PracticePhase) => void;
};

export function PracticeWhiteboardContent({
  problem,
  questionNumber,
  totalProblems,
  onCorrect,
  onExhausted,
  onWrong,
  onHintPhaseChange,
}: ContentProps) {
  const searchParams = useSearchParams();
  // ?debug=orb — roaming "living" orb. Off = fixed corner orb.
  const debugOrb = (searchParams.get("debug") ?? "").split(",").map((s) => s.trim()).includes("orb");
  const stepFocusRef = useRef<StepFocus | null>(null);
  const handleStepFocus = useCallback((f: StepFocus | null) => {
    stepFocusRef.current = f;
  }, []);
  const [transientCaption, setTransientCaption] = useState<string | null>(null);
  const { play: playNarration, cancel: cancelNarration, orbState: narrationOrbState } =
    useQuestionNarration();
  // Project orb state onto the existing union (the legacy "listening"
  // value is set elsewhere; the narration hook only emits idle/thinking/
  // speaking).
  const orbState: "idle" | "thinking" | "speaking" | "listening" = narrationOrbState;
  // Drives the canvas-overlay "Correct!" pulse + confetti. Set when the
  // student selects the correct option; auto-advance unmounts the pane
  // shortly after, so this only ever flips false→true within a single
  // problem lifetime. Reset on problem change.
  const [revealedCorrect, setRevealedCorrect] = useState(false);

  // Reset caption when the problem changes — use the official
  // "store-prop-as-state" pattern so the reset is observable in render
  // without touching refs.
  const [lastProblemId, setLastProblemId] = useState(problem.id);
  if (lastProblemId !== problem.id) {
    setLastProblemId(problem.id);
    setTransientCaption(null);
    cancelNarration();
    setRevealedCorrect(false);
  }

  // ── Auto-play question narration on each new problem ───────────────────
  //
  // Prefer the model-authored phonetic narration (populated for backfilled
  // rows; future seeds emit it at author time). Falls back to a runtime
  // strip of `$...$` math delimiters for rows that haven't been backfilled.
  const problemId = problem.id;
  useEffect(() => {
    const phonetic =
      problem.questionPhonetic?.trim() ||
      stripTtsNoise(problem.questionText || "").trim();
    // Question is interruptible — when the student picks an answer, the
    // phase change fires `cancelNarration({ onlyInterruptible: true })`
    // (see handlePhaseChange) which cuts the question without cutting a
    // hint that's mid-sentence.
    if (phonetic) playNarration(phonetic, { interruptible: true });
    // playNarration is stable (useCallback([])); deps key on problemId so
    // we re-fire only when the question itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId]);

  // ── Phase-driven caption + narration (the orb caption flow) ─────────────

  const handlePhaseChange = useCallback(
    (phase: PracticePhase) => {
      onHintPhaseChange?.(phase);
      // Phase moving away from "answering" means the student has acted.
      // Cut any in-flight question narration; leave hint/explanation
      // narrations alone (they were started non-interruptible).
      if (phase !== "answering") {
        cancelNarration({ onlyInterruptible: true });
      }
      if (phase === "hinted") {
        const t = problem.hint?.trim();
        if (t) {
          setTransientCaption(t);
          // Hint plays through — the student hears the whole nudge
          // before the next problem's question starts.
          playNarration(t, { interruptible: false });
        }
      } else if (phase === "detailed") {
        const t = problem.detailedHint?.trim() || problem.hint?.trim();
        if (t) {
          setTransientCaption(t);
          playNarration(t, { interruptible: false });
        }
      } else if (phase === "answering") {
        setTransientCaption(null);
      } else if (phase === "revealed") {
        // Surface the explanation under the orb so the student reads
        // the "why" while the auto-advance timer counts down.
        const t = problem.explanation?.trim();
        if (t) setTransientCaption(t);
      }
    },
    [problem.hint, problem.detailedHint, problem.explanation, playNarration, cancelNarration, onHintPhaseChange],
  );

  // ── Whiteboard scene ───────────────────────────────────────────────────

  const whiteboardSteps = useMemo<WhiteboardStep[]>(() => {
    if (problem.whiteboardSteps && problem.whiteboardSteps.length > 0) {
      return problem.whiteboardSteps;
    }
    return synthesizeQuestionStep(problem);
  }, [problem]);

  const visibleStepIds = useMemo<Set<number>>(
    () => new Set(whiteboardSteps.map((s) => s.id)),
    [whiteboardSteps],
  );

  const isMobilePortrait = useLessonViewport() === "mobile-portrait";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Canvas region — orb floats top-left over the iso-contour frame. */}
      <div className="relative flex-1 min-h-0">
        {debugOrb ? (
          <PresenceLayer
            orbState={orbState}
            amplitude={0}
            size={isMobilePortrait ? 60 : 100}
            captionText={transientCaption}
            mode="rest"
            restAnchor={isMobilePortrait ? { x: 40, y: 40 } : { x: 62, y: 62 }}
            stepFocusRef={stepFocusRef}
          />
        ) : (
        <div className="absolute top-3 left-3 z-20 flex flex-col items-center gap-2 pointer-events-none w-[220px] origin-top-left scale-[0.65] sm:scale-100">
          <ObservationOrb state={orbState} amplitude={0} size={isMobilePortrait ? 60 : 100} />
          <AnimatePresence mode="wait">
            {transientCaption ? (
              <motion.div
                key={transientCaption}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="obs-serif text-center text-sm leading-snug text-[var(--obs-muted)] rounded-xl px-3 py-1.5 backdrop-blur-md shadow-lg shadow-black/10 border border-white/5"
                style={{
                  background:
                    "color-mix(in oklch, var(--obs-surface) 70%, transparent)",
                }}
              >
                <MathContent content={transientCaption} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        )}

        <IsoContourFrame bottomCenterLabel="" bottomRightLabel="">
          <div className="relative h-full w-full">
            {/* Plain opacity cross-fade on problem swap. Previously this
                used a y:12→0 spring + AnimatePresence mode="wait" which,
                combined with the bottom pane's y:8→0 keyed remount,
                produced a multi-stage animation where the pane finished
                fading well before the canvas, with visible layout shift
                across the transition. */}
            <AnimatePresence mode="wait">
              <motion.div
                key={problem.id}
                className="h-full w-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                {isMobilePortrait ? (
                  <div className="h-full w-full overflow-y-auto pt-20">
                    <MobileLessonRenderer
                      steps={whiteboardSteps}
                      visibleStepIds={visibleStepIds}
                      currentStepIndex={Math.max(0, whiteboardSteps.length - 1)}
                      stepProgress={1}
                    />
                  </div>
                ) : (
                  <WhiteboardCanvas
                    steps={whiteboardSteps}
                    visibleStepIds={visibleStepIds}
                    currentStepIndex={Math.max(0, whiteboardSteps.length - 1)}
                    stepProgress={1}
                    equalScaleCoords
                    sequentialDiagrams={debugOrb}
                    onStepFocus={debugOrb ? handleStepFocus : undefined}
                  />
                )}
              </motion.div>
            </AnimatePresence>

            {/* Canvas-level "Correct!" pulse. Mirrors the in-lesson
                check-in / predict / fill_blank correct feedback so
                practice feedback feels continuous with the rest of the
                lesson surface. Bug fix: previously this rendered inside
                the bottom interaction pane (under the answer buttons),
                which is the wrong place for student-facing feedback —
                the student is looking at the canvas, not the pane. */}
            <AnimatePresence>
              {revealedCorrect ? (
                <motion.div
                  key="correct-pulse"
                  className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <CorrectConfetti />
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 15,
                    }}
                    className="relative z-20 flex items-center gap-2 rounded-full border border-green-500/40 bg-green-500/10 px-4 py-2 shadow-lg shadow-green-500/20 backdrop-blur-md"
                  >
                    <Check className="h-5 w-5 text-green-500" />
                    <span className="text-base font-bold text-green-500">
                      Correct!
                    </span>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </IsoContourFrame>
      </div>

      {/* Bottom interaction pane — same shape as the micro-lesson's.
          NOT keyed on problem.id: PracticePane's internal lastProblemId
          prop-as-state pattern resets phase/selected/wrongIndices when
          the problem prop changes, so we don't need a full remount.
          Keeping the pane mounted also avoids the slide-up + flash that
          stacked badly with the canvas cross-fade. */}
      <div className="shrink-0 bg-[var(--obs-surface)] px-8 py-4">
        <div className="mx-auto w-full max-w-[720px]">
          <PracticePane
            problem={problem}
            questionNumber={questionNumber}
            totalProblems={totalProblems}
            onCorrect={onCorrect}
            onExhausted={onExhausted}
            onWrong={onWrong}
            onHintPhaseChange={handlePhaseChange}
            onRevealedCorrect={() => setRevealedCorrect(true)}
            // Show question text in the pane when the canvas isn't
            // displaying problem-specific visuals — most SAT-style
            // problems are mostly prose, so this is the common path.
            showQuestionInPane={whiteboardSteps.length === 0}
          />
        </div>
      </div>
    </div>
  );
}

// ── Standalone surface (with frame chrome) ────────────────────────────────

type StandaloneProps = ContentProps & {
  onBack?: () => void;
};

export function PracticeWhiteboard({
  problem,
  questionNumber,
  totalProblems,
  onCorrect,
  onExhausted,
  onWrong,
  onHintPhaseChange,
  onBack,
}: StandaloneProps) {
  return (
    <ObservationFrame onBack={onBack}>
      <PracticeWhiteboardContent
        problem={problem}
        questionNumber={questionNumber}
        totalProblems={totalProblems}
        onCorrect={onCorrect}
        onExhausted={onExhausted}
        onWrong={onWrong}
        onHintPhaseChange={onHintPhaseChange}
      />
    </ObservationFrame>
  );
}
