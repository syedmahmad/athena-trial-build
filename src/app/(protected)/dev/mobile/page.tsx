"use client";

import { useMemo, useState } from "react";
import { MobileLessonRenderer } from "@/components/whiteboard/mobile/mobile-lesson-renderer";
import type { WhiteboardStep } from "@/types/whiteboard";
import oneVar from "@/lib/evals/ideal-lessons/algebra-linear-equations-one-variable.json";
import twoVar from "@/lib/evals/ideal-lessons/algebra-linear-equations-two-variables.json";

/**
 * Isolated dev harness for the portrait mobile lesson renderer (Workstream A1
 * + A3). Drives real ideal lessons (and a synthetic figures lesson covering
 * geometry + number_line, which no ideal lesson exercises) through
 * MobileLessonRenderer inside a phone-width frame, so the card stack, triplet
 * morph, and figure islands can be verified without touching the live
 * micro-lesson surface. Wiring into micro-lesson.tsx behind useLessonViewport()
 * is the later Phase A4 step.
 */

/** Synthetic lesson: one of each figure archetype the ideal lessons don't
 *  cover, so the portrait figure renderers can be eyeballed. */
const FIGURES: WhiteboardStep[] = [
  {
    id: 1,
    delayMs: 0,
    durationMs: 0,
    action: { type: "section_heading", text: "Figure archetypes" },
  },
  {
    id: 2,
    delayMs: 0,
    durationMs: 0,
    action: {
      type: "geometry",
      height: 280,
      figures: [
        {
          type: "polygon",
          vertices: [
            { x: 12, y: 85 },
            { x: 88, y: 85 },
            { x: 12, y: 15 },
          ],
          vertexLabels: ["A", "B", "C"],
          style: { strokeColor: "#60a5fa", strokeWidth: 2 },
        },
      ],
      annotations: [
        { type: "right_angle", vertex: { x: 12, y: 85 }, size: 12 },
        { type: "dimension", from: { x: 12, y: 85 }, to: { x: 88, y: 85 }, label: "12" },
        { type: "dimension", from: { x: 12, y: 85 }, to: { x: 12, y: 15 }, label: "5" },
      ],
    },
  },
  {
    id: 3,
    delayMs: 0,
    durationMs: 0,
    action: {
      type: "number_line",
      range: [-2, 8],
      tickInterval: 1,
      points: [{ value: 3, label: "x = 3", style: { color: "#f87171", filled: true } }],
      intervals: [{ from: 3, to: 8, fromInclusive: true, color: "#60a5fa" }],
    },
  },
];

const FIXTURES = {
  "1-var (morph)": oneVar as unknown as WhiteboardStep[],
  "2-var (coord plane)": twoVar as unknown as WhiteboardStep[],
  "figures (synthetic)": FIGURES,
} as const;

type FixtureKey = keyof typeof FIXTURES;

export default function DevMobileLessonPage() {
  const [fixtureKey, setFixtureKey] = useState<FixtureKey>("1-var (morph)");
  const steps = FIXTURES[fixtureKey];
  const [current, setCurrent] = useState(steps.length - 1);

  const visibleStepIds = useMemo(
    () => new Set(steps.slice(0, current + 1).map((s) => s.id)),
    [steps, current]
  );

  const safeCurrent = Math.min(current, steps.length - 1);
  const step = steps[safeCurrent];

  return (
    <div className="flex min-h-screen flex-col items-center gap-4 bg-muted/30 py-8">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {(Object.keys(FIXTURES) as FixtureKey[]).map((k) => (
          <button
            key={k}
            className={`rounded border px-3 py-1 text-sm ${
              k === fixtureKey ? "bg-foreground text-background" : ""
            }`}
            onClick={() => {
              setFixtureKey(k);
              setCurrent(FIXTURES[k].length - 1);
            }}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 text-sm">
        <button
          className="rounded border px-3 py-1 disabled:opacity-40"
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
        >
          ← Prev
        </button>
        <span className="tabular-nums text-muted-foreground">
          step {Math.min(current, steps.length - 1) + 1} / {steps.length}
          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">
            {step?.action.type}
          </span>
        </span>
        <button
          className="rounded border px-3 py-1 disabled:opacity-40"
          onClick={() => setCurrent((c) => Math.min(steps.length - 1, c + 1))}
          disabled={current >= steps.length - 1}
        >
          Next →
        </button>
      </div>

      {/* Phone frame: 390px ~ iPhone portrait CSS width. Teaching renderer
          only — interactions ship via the existing (now responsive)
          CheckIn/Predict/FillBlank/PulseCheck cards in micro-lesson.tsx, which
          carry the real takeover/hint state machine. */}
      <div className="relative h-[780px] w-[390px] overflow-hidden rounded-[2rem] border-4 border-foreground/80 bg-background shadow-xl">
        <div className="h-full overflow-y-auto">
          <MobileLessonRenderer
            steps={steps}
            visibleStepIds={visibleStepIds}
            currentStepIndex={safeCurrent}
            stepProgress={1}
          />
        </div>
      </div>
    </div>
  );
}
