"use client";

import { motion } from "framer-motion";
import type { NumberLineAction, PointStyle } from "@/types/whiteboard";
import { adaptWbColor, useIsDarkMode } from "../wb-color";

type WbNumberLineProps = {
  action: NumberLineAction;
  x: number;
  y: number;
  width: number;
  height: number;
  progress: number;
  isAnimating: boolean;
};

const LINE_Y_OFFSET = 0.55; // fraction of height where the line sits
const PADDING = 30;

export function WbNumberLine({
  action,
  x,
  y,
  width,
  height,
  progress,
  isAnimating,
}: WbNumberLineProps) {
  const isDark = useIsDarkMode();
  // Tolerant range read: the canonical schema is `range: [min, max]`
  // but generated lessons sometimes ship `min` + `max` as scalar fields
  // (mirrors the same canonical-field divergence we already handle on
  // coordinate_plane). Accept both so the line renders correctly while
  // the action-shape evaluator nudges authors back to the canonical
  // shape in future generations.
  const a = action as NumberLineAction & { min?: number; max?: number };
  const [rangeMin, rangeMax] =
    Array.isArray(a.range) && a.range.length === 2
      ? a.range
      : typeof a.min === "number" && typeof a.max === "number"
        ? [a.min, a.max]
        : [0, 10];
  const tickInterval = action.tickInterval ?? 1;

  const lineY = y + height * LINE_Y_OFFSET;
  const lineLeft = x + PADDING;
  const lineRight = x + width - PADDING;
  const lineWidth = lineRight - lineLeft;

  /** Map a numeric value to SVG x coordinate. */
  function valToX(v: number): number {
    return lineLeft + ((v - rangeMin) / (rangeMax - rangeMin)) * lineWidth;
  }

  // Generate tick values
  const ticks: number[] = [];
  for (let v = Math.ceil(rangeMin / tickInterval) * tickInterval; v <= rangeMax; v += tickInterval) {
    ticks.push(v);
  }

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Shaded intervals (behind everything) */}
      {action.intervals?.map((interval, i) => {
        const fromX = valToX(interval.from);
        const toX = valToX(interval.to);
        const minX = Math.max(lineLeft, Math.min(fromX, toX));
        const maxX = Math.min(lineRight, Math.max(fromX, toX));
        return (
          <rect
            key={`int-${i}`}
            x={minX}
            y={lineY - 8}
            width={maxX - minX}
            height={16}
            fill={interval.color ?? "#2563eb"}
            fillOpacity={0.2}
            rx="2"
          />
        );
      })}

      {/* Main line */}
      <line
        x1={lineLeft}
        y1={lineY}
        x2={lineRight}
        y2={lineY}
        style={{ stroke: "var(--secondary-foreground)" }}
        strokeWidth="2"
      />

      {/* Arrow tips */}
      <polygon
        points={`${lineRight},${lineY} ${lineRight - 7},${lineY - 4} ${lineRight - 7},${lineY + 4}`}
        style={{ fill: "var(--secondary-foreground)" }}
      />
      <polygon
        points={`${lineLeft},${lineY} ${lineLeft + 7},${lineY - 4} ${lineLeft + 7},${lineY + 4}`}
        style={{ fill: "var(--secondary-foreground)" }}
      />

      {/* Tick marks + labels */}
      {ticks.map((v) => {
        const tx = valToX(v);
        return (
          <g key={`tick-${v}`}>
            <line
              x1={tx}
              y1={lineY - 5}
              x2={tx}
              y2={lineY + 5}
              style={{ stroke: "var(--secondary-foreground)" }}
              strokeWidth="1.5"
            />
            <text
              x={tx}
              y={lineY + 18}
              textAnchor="middle"
              fontSize="11"
              style={{ fill: "var(--muted-foreground)" }}
              fontFamily="system-ui, sans-serif"
            >
              {v}
            </text>
          </g>
        );
      })}

      {/* Points — canonical field is `points`, but generated lessons
          sometimes call them `markers` with `value`/`label`/`color`
          flat on each entry (no `style` wrapper). Accept both. */}
      {(() => {
        type Pt = { value: number; label?: string; style?: PointStyle };
        const fromPoints: Pt[] = action.points ?? [];
        const markers =
          (a as { markers?: Array<{ value: number; label?: string; color?: string }> })
            .markers ?? [];
        const fromMarkers: Pt[] = markers.map((m) => ({
          value: m.value,
          label: m.label,
          style: m.color ? { color: m.color } : undefined,
        }));
        return fromPoints.length ? fromPoints : fromMarkers;
      })().map((pt, i) => {
        const px = valToX(pt.value);
        const filled = pt.style?.filled !== false;
        const r = pt.style?.radius ?? 5;
        const color = adaptWbColor(pt.style?.color ?? "#2563eb", isDark);
        return (
          <g key={`pt-${i}`}>
            <motion.circle
              cx={px}
              cy={lineY}
              r={r}
              fill={filled ? color : "var(--wb-canvas)"}
              stroke={color}
              strokeWidth="2"
              initial={{ scale: 0 }}
              animate={{ scale: progress > 0 ? 1 : 0 }}
              transition={{ duration: 0.2, delay: isAnimating ? i * 0.1 : 0 }}
            />
            {pt.label && (
              <text
                x={px}
                y={lineY - r - 6}
                textAnchor="middle"
                fontSize="11"
                style={{ fill: "var(--secondary-foreground)" }}
                fontWeight="bold"
                fontFamily="system-ui, sans-serif"
              >
                {pt.label}
              </text>
            )}
          </g>
        );
      })}

      {/* Interval endpoint indicators */}
      {action.intervals?.map((interval, i) => {
        const fromX = valToX(interval.from);
        const toX = valToX(interval.to);
        const color = adaptWbColor(interval.color ?? "#2563eb", isDark);
        return (
          <g key={`int-ep-${i}`}>
            {/* From endpoint */}
            <circle
              cx={fromX}
              cy={lineY}
              r={4}
              fill={interval.fromInclusive ? color : "var(--wb-canvas)"}
              stroke={color}
              strokeWidth="2"
            />
            {/* To endpoint */}
            <circle
              cx={toX}
              cy={lineY}
              r={4}
              fill={interval.toInclusive ? color : "var(--wb-canvas)"}
              stroke={color}
              strokeWidth="2"
            />
          </g>
        );
      })}
    </motion.g>
  );
}
