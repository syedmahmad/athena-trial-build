"use client";

import { motion } from "framer-motion";

/**
 * Centered "waiting for the tutor" loading symbol, themed to the
 * observation (obs) palette. Rendered as an overlay over the lesson /
 * mentor canvas while a spoken utterance is in flight to the LLM —
 * paired with the spoken acknowledgement caption under the orb. The
 * caption carries the words ("Give me a moment."); this is the silent
 * visual that the tutor is working.
 *
 * Visual: a soft pulsing halo behind a faint full ring with a single
 * accent arc sweeping around it. No text — the caption owns that.
 */
export function ThinkingIndicator({ size = 56 }: { size?: number }) {
  const stroke = Math.max(2, Math.round(size * 0.06));
  return (
    <div
      className="pointer-events-none relative flex items-center justify-center"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Athena is thinking"
    >
      {/* Soft pulsing halo */}
      <motion.span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklch, var(--obs-accent) 35%, transparent) 0%, transparent 70%)",
        }}
        animate={{ opacity: [0.35, 0.7, 0.35], scale: [0.9, 1.15, 0.9] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Faint static track + sweeping accent arc */}
      <motion.svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="relative"
        animate={{ rotate: 360 }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={(size - stroke) / 2}
          fill="none"
          stroke="var(--obs-border)"
          strokeWidth={stroke}
          opacity={0.4}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={(size - stroke) / 2}
          fill="none"
          stroke="var(--obs-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={Math.PI * (size - stroke)}
          strokeDashoffset={Math.PI * (size - stroke) * 0.72}
        />
      </motion.svg>
    </div>
  );
}
