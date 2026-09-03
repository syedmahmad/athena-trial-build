"use client";

import { motion } from "framer-motion";

export type FlyingAnswerState = { text: string; runId: number };

/**
 * Flying-answer transition. When the student sends a chat message
 * (typed, voice, or handwritten), the text lifts off the input /
 * history line at the bottom of the column, shuffles for a beat, then
 * streams up into the Extra Help panel on the right — so the message
 * reads as "going into" the tutor conversation. Reserved for genuine
 * student input: the auto-fired 2nd-wrong takeover does not animate,
 * since its seed prompt is Athena-generated, not typed by the student.
 *
 * Anchored to the full lesson column (a `relative` ancestor that spans
 * down to the input line) via `absolute inset-0`, so it genuinely
 * starts at the input line and ends inside the right-hand sidebar.
 *
 * Timing note (load-bearing): opacity holds at 1 THROUGH the up+right
 * travel and only fades in the final 15%. An earlier version faded out
 * during the travel window, which made the rightward sweep invisible —
 * the letters appeared to shuffle at the bottom and vanish. Verify any
 * change to the `times` / keyframe arrays with the Playwright harness
 * at /dev/fly (.local/playwright/tests/flying-answer.spec capture).
 *
 * Math.random is intentionally avoided — the react-hooks/purity lint
 * rule forbids it during render — so the per-letter "shuffle" jitter is
 * a deterministic function of the glyph index.
 */
export function FlyingAnswer({ flying }: { flying: FlyingAnswerState | null }) {
  if (!flying) return null;
  const raw = flying.text;
  const snippet = raw.length > 28 ? raw.slice(0, 28) + "…" : raw;
  const chars = Array.from(snippet);
  const n = chars.length;
  return (
    <div
      key={flying.runId}
      data-testid="flying-answer"
      className="pointer-events-none absolute inset-0 z-40 overflow-hidden"
    >
      {chars.map((ch, i) => {
        // Start: spread along the input line, centered. End: converge
        // into the right-hand Extra Help sidebar near its header.
        const startLeft = 50 + (i - (n - 1) / 2) * 1.1;
        const jx = ((i % 3) - 1) * 1.4; // -1.4 / 0 / +1.4 shuffle
        const jy = (i % 2 === 0 ? -1 : 1) * 1.8;
        return (
          <motion.span
            key={`${flying.runId}-${i}`}
            data-fly-glyph={i}
            className="absolute font-mono text-lg font-semibold"
            style={{
              color: "var(--obs-glow-mid, #8b9cff)",
              textShadow: "0 0 12px var(--obs-glow-mid, #8b9cff)",
            }}
            initial={{
              left: `${startLeft}%`,
              top: "90%",
              opacity: 0,
              scale: 0.5,
            }}
            animate={{
              // shuffle at the input line, then sweep up AND right into
              // the sidebar. Last stop holds position while fading.
              left: [
                `${startLeft}%`,
                `${startLeft + jx}%`,
                `${startLeft}%`,
                "88%",
                "88%",
              ],
              top: ["90%", `${90 + jy}%`, "84%", "14%", "9%"],
              opacity: [0, 1, 1, 1, 0],
              scale: [0.5, 1, 1, 1.05, 0.7],
            }}
            transition={{
              duration: 1.4,
              delay: i * 0.03,
              times: [0, 0.12, 0.32, 0.85, 1],
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {ch === " " ? " " : ch}
          </motion.span>
        );
      })}
    </div>
  );
}
