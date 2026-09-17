"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Rank } from "@/lib/ranks";

/** Full-screen celebratory beat for crossing a rank threshold. The tier
 *  data model (RANKS in lib/ranks.ts) already existed — today crossing a
 *  threshold just moved a progress bar with no acknowledgment. This is
 *  the "real rank-up moment" from the trial proposal's visual-design
 *  section, wired to the existing rank-up detector in use-rank-up.ts.
 *
 *  Dismiss on tap/click anywhere, or auto-dismiss after ~4.5s so it
 *  never blocks a student who's mid-session and just wants to continue. */
export function RankUpCelebration({
  rank,
  onDismiss,
}: {
  rank: Rank | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!rank) return;
    const timer = setTimeout(onDismiss, 4500);
    return () => clearTimeout(timer);
  }, [rank, onDismiss]);

  const colors = [
    "hsl(var(--green))",
    "hsl(var(--blue))",
    "hsl(var(--yellow))",
    "hsl(var(--pink))",
    "hsl(var(--orange))",
  ];
  const particles = Array.from({ length: 28 }, (_, i) => ({
    id: i,
    x: 10 + Math.random() * 80,
    delay: Math.random() * 0.5,
    size: 4 + Math.random() * 5,
    color: colors[i % colors.length],
  }));

  return (
    <AnimatePresence>
      {rank && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
          className="fixed inset-0 z-[100] flex cursor-pointer items-center justify-center bg-background/80 backdrop-blur-sm"
        >
          {/* Confetti burst */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {particles.map((p) => (
              <motion.div
                key={p.id}
                className="absolute rounded-full"
                style={{
                  left: `${p.x}%`,
                  top: "45%",
                  width: p.size,
                  height: p.size,
                  backgroundColor: p.color,
                }}
                initial={{ y: 0, opacity: 1 }}
                animate={{
                  y: -260 - Math.random() * 200,
                  opacity: [1, 1, 0],
                  x: (Math.random() - 0.5) * 220,
                }}
                transition={{
                  duration: 1.6 + Math.random() * 0.6,
                  delay: p.delay,
                  ease: "easeOut",
                }}
              />
            ))}
          </div>

          <motion.div
            initial={{ scale: 0.6, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="relative flex flex-col items-center gap-3 px-8 text-center"
          >
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              Rank Up
            </span>
            <motion.span
              className="text-7xl"
              initial={{ rotate: -8 }}
              animate={{ rotate: [-8, 8, -4, 0] }}
              transition={{ duration: 0.6, delay: 0.15 }}
            >
              {rank.emoji}
            </motion.span>
            <h2 className="text-4xl font-bold tracking-tight text-foreground">
              {rank.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              Wielding: <span className="italic text-foreground">{rank.weapon}</span>
            </p>
            <span className="mt-2 text-xs text-muted-foreground/70">
              Tap anywhere to continue
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
