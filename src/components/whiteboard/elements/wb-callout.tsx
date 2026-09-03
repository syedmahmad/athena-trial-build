"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { CalloutAction } from "@/types/whiteboard";
import { MathContent } from "@/components/quiz/math-content";

const VARIANT_STYLES: Record<
  CalloutAction["variant"],
  { accent: string; eyebrow: string; defaultLabel: string }
> = {
  hint: {
    accent: "var(--athena-amber)",
    eyebrow: "var(--athena-amber)",
    defaultLabel: "HINT",
  },
  "detailed-hint": {
    accent: "oklch(0.74 0.20 295)",
    eyebrow: "oklch(0.74 0.20 295)",
    defaultLabel: "DETAILED HINT",
  },
  "answer-correct": {
    accent: "oklch(0.72 0.18 145)",
    eyebrow: "oklch(0.72 0.18 145)",
    defaultLabel: "CORRECT",
  },
  "answer-incorrect": {
    accent: "oklch(0.65 0.22 25)",
    eyebrow: "oklch(0.65 0.22 25)",
    defaultLabel: "ANSWER",
  },
};

type WbCalloutProps = {
  action: CalloutAction;
  width: number;
  progress: number;
  isAnimating: boolean;
  onMeasure?: (height: number) => void;
};

/** Flow-native callout. Renders as plain HTML — the canvas's HTML
 *  overlay layer in whiteboard-canvas is responsible for positioning
 *  this in viewport-pixel space. Sibling-to-SVG architecture rather
 *  than SVG <foreignObject> because Safari's foreignObject paint
 *  position diverges from its bounding-rect under SVG transforms,
 *  causing content to visually overlap the row above. The same
 *  pattern wb-math uses. */
export function WbCallout({
  action,
  width,
  progress,
  isAnimating,
  onMeasure,
}: WbCalloutProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const onMeasureRef = useRef(onMeasure);

  // Final defense: any callout reaching here without a real body
  // (empty / whitespace) renders nothing instead of an empty pill.
  // The upstream synthesizers already filter, but the model can also
  // author callout actions directly.
  const hasBody = typeof action.body === "string" && action.body.trim().length > 0;
  if (!hasBody) return null;
  useEffect(() => {
    onMeasureRef.current = onMeasure;
  });

  useEffect(() => {
    if (!wrapperRef.current) return;
    const h = wrapperRef.current.scrollHeight;
    if (h > 0 && Math.abs(h - contentHeight) > 2) {
      setContentHeight(h);
      onMeasureRef.current?.(h);
    }
  }, [action.body, contentHeight, width]);

  const { accent, eyebrow, defaultLabel } =
    VARIANT_STYLES[action.variant] ?? VARIANT_STYLES.hint;
  const label = action.eyebrow ?? defaultLabel;

  return (
    <motion.div
      ref={wrapperRef}
      initial={isAnimating ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: progress > 0 ? 1 : 0, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      style={{
        position: "relative",
        width,
        paddingLeft: 18,
        paddingRight: 18,
        paddingTop: 14,
        paddingBottom: 14,
        background: "color-mix(in oklch, var(--obs-surface) 60%, transparent)",
        border: `1px solid color-mix(in oklch, ${accent} 30%, transparent)`,
        borderRadius: 10,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 8,
          bottom: 8,
          width: 3,
          background: accent,
          borderRadius: 3,
        }}
      />
      {isAnimating && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0] }}
          transition={{ duration: 1.4, ease: "easeOut" }}
          style={{
            position: "absolute",
            inset: -2,
            borderRadius: 12,
            boxShadow: `0 0 28px 4px ${accent}`,
            pointerEvents: "none",
          }}
        />
      )}
      <div
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: eyebrow,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        className="wb-callout-body"
        style={{ color: "var(--foreground)", fontSize: 16, lineHeight: 1.55 }}
      >
        <MathContent content={action.body} />
      </div>
    </motion.div>
  );
}
