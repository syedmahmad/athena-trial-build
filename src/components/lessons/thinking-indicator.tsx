"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type ThinkingIndicatorProps = {
  variant?: "compact" | "prominent";
};

export function ThinkingIndicator({ variant = "compact" }: ThinkingIndicatorProps) {
  const isProminent = variant === "prominent";

  return (
    <motion.div
      className={cn(
        "flex items-center gap-2",
        isProminent
          ? "bg-athena-amber/5 border border-athena-amber/20 rounded-lg px-4 py-3"
          : "px-3 py-2"
      )}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <Sparkles
          className={cn(
            "text-athena-amber",
            isProminent ? "h-6 w-6" : "h-4 w-4"
          )}
        />
      </motion.div>
      <motion.span
        className={cn(
          "text-sm text-muted-foreground",
          isProminent && "font-medium"
        )}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      >
        Athena is thinking…
      </motion.span>
      {isProminent && (
        <div className="flex items-center gap-[3px] ml-0.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="h-1 w-1 rounded-full bg-athena-amber/60"
              animate={{ y: [0, -4, 0] }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.15,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
