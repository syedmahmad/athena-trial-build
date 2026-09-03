"use client";

import { motion } from "framer-motion";

export function CompositeScore({
  score,
  targetScore,
}: {
  score: number;
  targetScore: number;
}) {
  const pointsToTarget = Math.max(targetScore - score, 0);
  const pointsToPerfect = Math.max(1600 - score, 0);
  const pct = Math.min((score / 1600) * 100, 100);

  return (
    <div className="border bg-card p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Composite Score
          </p>
          <span className="text-5xl font-bold tabular-nums tracking-tight">
            {score}
          </span>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Target
          </p>
          <span className="text-3xl font-bold tabular-nums tracking-tight">
            {targetScore}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4 relative">
        <div className="h-3 w-full overflow-hidden bg-muted">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </div>
        {/* Target marker */}
        <div
          className="absolute top-0 h-3 w-0.5 bg-foreground/40"
          style={{ left: `${(targetScore / 1600) * 100}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {pointsToTarget > 0 ? `${pointsToTarget} points to target` : "Target reached!"} &middot; {pointsToPerfect} to perfect
      </p>
    </div>
  );
}
