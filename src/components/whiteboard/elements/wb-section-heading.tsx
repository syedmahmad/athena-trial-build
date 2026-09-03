"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { SectionHeadingAction } from "@/types/whiteboard";
import { MathContent } from "@/components/quiz/math-content";

type WbSectionHeadingProps = {
  action: SectionHeadingAction;
  width: number;
  progress: number;
  isAnimating: boolean;
  onMeasure?: (height: number) => void;
};

/** Section heading — introduces a new part of the lesson. Renders as a
 *  large bold title with an optional muted subtitle, on its own row in
 *  the canvas flow. Mirrors WbCallout's HTML-overlay sibling-of-SVG
 *  pattern so KaTeX inside `$...$` paints reliably across browsers. */
export function WbSectionHeading({
  action,
  width,
  progress,
  isAnimating,
  onMeasure,
}: WbSectionHeadingProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const onMeasureRef = useRef(onMeasure);
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
  }, [action.text, action.subtitle, contentHeight, width]);

  return (
    <motion.div
      ref={wrapperRef}
      initial={isAnimating ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: progress > 0 ? 1 : 0, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      style={{
        position: "relative",
        width,
        paddingTop: 8,
        paddingBottom: 8,
      }}
    >
      <div
        style={{
          color: "var(--obs-fg)",
          fontFamily: "var(--font-instrument-serif), \"Times New Roman\", serif",
          fontSize: 44,
          fontWeight: 400,
          lineHeight: 1.1,
          letterSpacing: "-0.01em",
        }}
      >
        <MathContent content={action.text} />
      </div>
      {action.subtitle ? (
        <div
          style={{
            marginTop: 4,
            color: "var(--obs-muted)",
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          <MathContent content={action.subtitle} />
        </div>
      ) : null}
    </motion.div>
  );
}
