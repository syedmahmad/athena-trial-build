"use client";

import { motion } from "framer-motion";

type SectionData = {
  subject: string;
  total: number;
  correct: number;
  accuracy: number;
  scaledScore: number;
};

export function SectionScores({
  rw,
  math,
  targetScore,
}: {
  rw: SectionData;
  math: SectionData;
  targetScore: number;
}) {
  const sectionTarget = Math.round(targetScore / 2);

  return (
    <div className="grid grid-cols-2 gap-4 h-full">
        <SectionCard
          label="Reading & Writing"
          score={rw.scaledScore}
          max={800}
          target={sectionTarget}
        />
        <SectionCard
          label="Math"
          score={math.scaledScore}
          max={800}
          target={sectionTarget}
        />
    </div>
  );
}

function SectionCard({
  label,
  score,
  max,
  target,
}: {
  label: string;
  score: number;
  max: number;
  target: number;
}) {
  const pct = max > 0 ? Math.min((score / max) * 100, 100) : 0;

  return (
    <div className="border bg-card p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-4xl font-bold tabular-nums">{score}</span>
        <span className="text-sm text-muted-foreground">/ {max}</span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden bg-muted">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Target: {target}
      </p>
    </div>
  );
}
