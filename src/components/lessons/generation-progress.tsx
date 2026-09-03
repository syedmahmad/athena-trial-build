"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, LayoutTemplate, PenTool, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const PHASES = [
  { message: "Analyzing the topic…", icon: Search, delay: 0 },
  { message: "Building lesson structure…", icon: LayoutTemplate, delay: 3000 },
  { message: "Drawing your whiteboard…", icon: PenTool, delay: 7000 },
  { message: "Almost there…", icon: Sparkles, delay: 12000 },
];

export function GenerationProgress({ className }: { className?: string }) {
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < PHASES.length; i++) {
      timers.push(setTimeout(() => setPhaseIndex(i), PHASES[i].delay));
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  const phase = PHASES[phaseIndex];
  const Icon = phase.icon;

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <AnimatePresence mode="wait">
        <motion.div
          key={phaseIndex}
          className="flex items-center gap-2.5"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          <motion.div
            animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Icon className="h-5 w-5 text-athena-amber" />
          </motion.div>
          <span className="text-sm text-muted-foreground font-medium">
            {phase.message}
          </span>
        </motion.div>
      </AnimatePresence>

      {/* Phase dots */}
      <div className="flex items-center gap-1.5">
        {PHASES.map((_, i) => (
          <motion.div
            key={i}
            className="h-1.5 w-1.5 rounded-full"
            animate={{
              backgroundColor:
                i <= phaseIndex
                  ? "var(--athena-amber)"
                  : "var(--muted-foreground)",
              scale: i === phaseIndex ? 1.3 : 1,
              opacity: i <= phaseIndex ? 1 : 0.3,
            }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          />
        ))}
      </div>
    </div>
  );
}
