"use client";

import { motion } from "framer-motion";
import type { ShapeStyle } from "@/types/whiteboard";

type WbShapeProps = {
  shape: "line" | "arrow" | "circle" | "rect";
  /** Points in LocalPoint (0-100) space, mapped within the bounding box */
  points: { x: number; y: number }[];
  x: number;
  y: number;
  width: number;
  height: number;
  style?: ShapeStyle;
  progress: number;
  isAnimating: boolean;
};

/** Map a LocalPoint (0-100) into SVG coords within the bounding box. */
function toSvg(p: { x: number; y: number }, bx: number, by: number, bw: number, bh: number) {
  return { x: bx + (p.x / 100) * bw, y: by + (p.y / 100) * bh };
}

export function WbShape({ shape, points, x, y, width, height, style, progress, isAnimating }: WbShapeProps) {
  const strokeColor = style?.strokeColor ?? "var(--secondary-foreground)";
  const strokeWidth = style?.strokeWidth ?? 2;
  const fillColor = style?.fillColor ?? "none";
  const dashed = style?.dashed ? "6 4" : undefined;

  if (shape === "circle" && points.length >= 2) {
    const c = toSvg(points[0], x, y, width, height);
    const e = toSvg(points[1], x, y, width, height);
    const rx = Math.abs(e.x - c.x);
    const ry = Math.abs(e.y - c.y);
    const circumference = 2 * Math.PI * Math.max(rx, ry);

    return (
      <motion.ellipse
        cx={c.x}
        cy={c.y}
        rx={rx}
        ry={ry}
        style={{ stroke: strokeColor }}
        strokeWidth={strokeWidth}
        fill={fillColor}
        strokeDasharray={isAnimating ? circumference : undefined}
        strokeDashoffset={isAnimating ? circumference * (1 - progress) : 0}
        strokeLinecap="round"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      />
    );
  }

  if (shape === "rect" && points.length >= 2) {
    const p1 = toSvg(points[0], x, y, width, height);
    const p2 = toSvg(points[1], x, y, width, height);
    const rx = Math.min(p1.x, p2.x);
    const ry2 = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);
    const perimeter = 2 * (w + h);

    return (
      <motion.rect
        x={rx}
        y={ry2}
        width={w}
        height={h}
        style={{ stroke: strokeColor }}
        strokeWidth={strokeWidth}
        fill={fillColor}
        strokeDasharray={isAnimating ? perimeter : dashed}
        strokeDashoffset={isAnimating ? perimeter * (1 - progress) : 0}
        strokeLinecap="round"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      />
    );
  }

  // line or arrow
  if (points.length >= 2) {
    const p1 = toSvg(points[0], x, y, width, height);
    const p2 = toSvg(points[1], x, y, width, height);
    const length = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    const markerId = shape === "arrow" ? `arrow-${p1.x}-${p1.y}-${p2.x}-${p2.y}` : undefined;

    return (
      <g>
        {shape === "arrow" && (
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: strokeColor }} />
            </marker>
          </defs>
        )}
        <motion.line
          x1={p1.x}
          y1={p1.y}
          x2={p2.x}
          y2={p2.y}
          style={{ stroke: strokeColor }}
          strokeWidth={strokeWidth}
          strokeDasharray={isAnimating ? length : dashed}
          strokeDashoffset={isAnimating ? length * (1 - progress) : 0}
          strokeLinecap="round"
          markerEnd={markerId ? `url(#${markerId})` : undefined}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        />
      </g>
    );
  }

  return null;
}
