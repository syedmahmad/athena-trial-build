"use client";

// Dev-only harness for the flying-answer transition. Renders the real
// <FlyingAnswer> over a mock lesson column (input/history line at the
// bottom, Extra Help sidebar on the right) so the animation can be
// driven + screenshotted in isolation, without walking a full lesson
// to a 2nd-wrong takeover. Driven by .local/playwright/tests/
// flying-answer.spec / fly-capture.mjs.

import { useState, type CSSProperties } from "react";
import {
  FlyingAnswer,
  type FlyingAnswerState,
} from "@/components/learning/flying-answer";

// Mirror the ObservationFrame CSS variables the component reads, so the
// glyphs are styled exactly as in a real lesson.
const OBS_VARS: CSSProperties = {
  ["--obs-glow-mid" as string]: "#8b9cff",
  ["--obs-border" as string]: "#262a44",
  ["--obs-bg" as string]: "#0c0e1a",
  ["--obs-surface" as string]: "#161a2e",
  ["--obs-fg" as string]: "#e8eaff",
  ["--obs-muted" as string]: "#8890b5",
};

const SAMPLE = "x equals negative three halves";

export default function FlyDevPage() {
  const [flying, setFlying] = useState<FlyingAnswerState | null>(null);
  const [runId, setRunId] = useState(0);
  const [text, setText] = useState(SAMPLE);

  const trigger = () => {
    const r = runId + 1;
    setRunId(r);
    setFlying(null);
    // next tick so the AnimatePresence/key remount restarts the run
    requestAnimationFrame(() => setFlying({ text, runId: r }));
  };

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-[var(--obs-bg)] text-[var(--obs-fg)]"
      style={OBS_VARS}
    >
      {/* mock Extra Help sidebar (right 40%) */}
      <div className="absolute right-0 top-0 bottom-0 z-10 flex w-[40%] min-w-[340px] max-w-[560px] flex-col border-l border-[var(--obs-border)] bg-[var(--obs-bg)]">
        <div className="px-4 pt-3 pb-1 font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--obs-fg)]">
          ✨ Extra Help
        </div>
      </div>

      {/* mock input / history line at the bottom of the column */}
      <div className="absolute bottom-4 left-0 right-0 z-10 flex flex-col items-center gap-2 px-8">
        <p className="font-mono text-[11px] tracking-[0.04em] text-[var(--obs-muted)]">
          → “{text}”
        </p>
        <div className="h-10 w-[60%] max-w-[640px] rounded-xl border border-[var(--obs-border)] bg-[var(--obs-surface)]" />
      </div>

      {/* dev controls */}
      <div className="absolute left-4 top-4 z-50 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-testid="fly-text"
          className="w-[280px] rounded border border-[var(--obs-border)] bg-[var(--obs-surface)] px-2 py-1 text-sm"
        />
        <button
          data-testid="fly-trigger"
          onClick={trigger}
          className="rounded bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20"
        >
          Trigger fly
        </button>
      </div>

      <FlyingAnswer flying={flying} />
    </div>
  );
}
