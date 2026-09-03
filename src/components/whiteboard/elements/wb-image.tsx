"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { ImageAction } from "@/types/whiteboard";

type WbImageProps = {
  action: ImageAction;
  width: number;
  progress: number;
  isAnimating: boolean;
  onMeasure?: (height: number) => void;
};

/** A curated illustration on the whiteboard. Renders as plain HTML through
 *  the canvas's HTML overlay layer (sibling-to-SVG, never <foreignObject>),
 *  the same pattern wb-callout / wb-table use. The image height is unknown
 *  until it loads, so we re-measure on load and report it back via onMeasure
 *  so the layout engine can reflow. Attribution is shown beneath the image —
 *  required for CC-BY / Wikimedia sources. */
export function WbImage({
  action,
  width,
  progress,
  isAnimating,
  onMeasure,
}: WbImageProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);
  const onMeasureRef = useRef(onMeasure);
  useEffect(() => {
    onMeasureRef.current = onMeasure;
  });

  const measure = () => {
    if (!wrapperRef.current) return;
    const h = wrapperRef.current.scrollHeight;
    if (h > 0 && Math.abs(h - measured) > 2) {
      setMeasured(h);
      onMeasureRef.current?.(h);
    }
  };
  useEffect(() => {
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.src, width]);

  if (!action.src) return null;

  return (
    <motion.div
      ref={wrapperRef}
      initial={isAnimating ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: progress > 0 ? 1 : 0, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      style={{ width }}
    >
      <div
        style={{
          borderRadius: 10,
          overflow: "hidden",
          border: "1px solid color-mix(in oklch, var(--foreground) 14%, transparent)",
          background: "color-mix(in oklch, var(--obs-surface, #0b0b0b) 70%, transparent)",
          display: "flex",
          justifyContent: "center",
        }}
      >
        {/* Raw <img> (not next/image) so any public image host works without
            remotePatterns config. */}
        <img
          src={action.src}
          alt={action.alt ?? action.caption ?? ""}
          onLoad={measure}
          style={{
            display: "block",
            maxWidth: "100%",
            maxHeight: 360,
            width: "auto",
            height: "auto",
            objectFit: action.fit ?? "contain",
          }}
        />
      </div>
      {action.caption ? (
        <div
          style={{
            color: "var(--muted-foreground)",
            fontSize: 13,
            lineHeight: 1.4,
            marginTop: 6,
          }}
        >
          {action.caption}
        </div>
      ) : null}
      {action.attribution ? (
        <div
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 10,
            letterSpacing: "0.02em",
            color: "var(--muted-foreground)",
            marginTop: action.caption ? 2 : 6,
            lineHeight: 1.4,
            opacity: 0.8,
          }}
        >
          {action.sourceUrl ? (
            <a
              href={action.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "inherit", textDecoration: "underline", pointerEvents: "auto" }}
            >
              {action.attribution}
            </a>
          ) : (
            action.attribution
          )}
        </div>
      ) : null}
    </motion.div>
  );
}
