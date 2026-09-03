"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

type StuckModalProps = {
  onComplete: () => void;
  title?: string;
  description?: string;
  autoProgress?: boolean;
  duration?: number;
};

export function StuckModal({
  onComplete,
  title = "Looks like you're stuck",
  description = "Athena will walk you through this",
  autoProgress = true,
  duration = 2800,
}: StuckModalProps) {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!autoProgress) return;
    const timer = setTimeout(() => onCompleteRef.current(), duration);
    return () => clearTimeout(timer);
  }, [autoProgress, duration]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 backdrop-blur-md"
      onClick={onComplete}
    >
      <motion.div
        initial={{ scale: 0.88, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 8 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        className="relative mx-4 w-full max-w-xs overflow-hidden rounded-2xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 py-10 text-center">
          {/* Icon */}
          <div className="mb-5 flex justify-center">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <motion.span
                className="absolute inset-0 rounded-full bg-primary/15"
                animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              />
              <Sparkles className="relative h-7 w-7 text-primary" />
            </div>
          </div>

          <h2 className="mb-2 text-base font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        {/* Auto-progress bar */}
        {autoProgress && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-muted">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: duration / 1000, ease: "linear" }}
            />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
