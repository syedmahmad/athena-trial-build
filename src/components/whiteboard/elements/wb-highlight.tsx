"use client";

import { motion } from "framer-motion";

type WbHighlightProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  progress: number;
};

export function WbHighlight({ x, y, width, height, color, progress }: WbHighlightProps) {
  return (
    <motion.rect
      x={x}
      y={y}
      width={width}
      height={Math.max(height, 32)}
      fill={color}
      fillOpacity={0.12}
      stroke={color}
      strokeOpacity={0.45}
      strokeWidth={1}
      rx="6"
      initial={{ opacity: 0 }}
      animate={{ opacity: progress > 0 ? [0, 1, 1, 0] : 0 }}
      // Fade in over 0.4s, hold visible for 1.2s, fade out over 0.4s.
      // Total 2s. After fadeout the rect is invisible until the step
      // restarts (e.g., scrubber replay) and progress flips back > 0.
      transition={{ duration: 2, times: [0, 0.2, 0.8, 1], ease: "easeInOut" }}
    />
  );
}
