import { useCurrentFrame, useVideoConfig } from "remotion";
import { drawProgress, fadeOpacity } from "../utils/timing";
import { WireframeTerrainBackground } from "./WireframeTerrainBackground";

/**
 * Rise/run right-triangle callout — beat b5 of Ex1.
 *
 * Draws a diagonal line at slope `line_slope`, then animates a right
 * triangle beneath it (rise leg first, then run leg). Dashed legs march
 * once drawn so the triangle reads as a live CAD measurement, and the
 * diagonal breathes. The slope formula is rendered as a math overlay by
 * OverlayLayer (single source of truth); `formula_latex` is accepted
 * for backwards compatibility but ignored here.
 */
export function RiseRunCallout({
  line_slope,
  rise_label = "rise",
  run_label = "run",
  beatDurationFrames: _beatDurationFrames,
}: {
  line_slope: number;
  show_rise_run_triangle?: boolean;
  rise_label?: string;
  run_label?: string;
  formula_latex?: string;
  beatDurationFrames: number;
}) {
  const framesSinceBeatStart = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const tSec = framesSinceBeatStart / fps;

  const cx = width * 0.42;
  const cy = height * 0.58;
  const runPx = 380;
  const risePx = line_slope * runPx;

  const A = { x: cx - runPx / 2, y: cy + risePx / 2 };
  const B = { x: cx + runPx / 2, y: cy - risePx / 2 };
  const C = { x: cx + runPx / 2, y: cy + risePx / 2 };

  const lineProgress = drawProgress({
    framesSinceBeatStart,
    fps,
    startMs: 0,
    durationMs: 1500,
  });
  const lineEnd = {
    x: A.x + (B.x - A.x) * lineProgress,
    y: A.y + (B.y - A.y) * lineProgress,
  };

  const runProgress = drawProgress({
    framesSinceBeatStart,
    fps,
    startMs: 1500,
    durationMs: 900,
  });
  const runEnd = {
    x: A.x + (C.x - A.x) * runProgress,
    y: A.y,
  };

  const riseProgress = drawProgress({
    framesSinceBeatStart,
    fps,
    startMs: 2300,
    durationMs: 900,
  });
  const riseEnd = {
    x: C.x,
    y: C.y + (B.y - C.y) * riseProgress,
  };

  const runLabelOpacity = fadeOpacity({
    framesSinceBeatStart,
    fps,
    appear_s: 2.4,
    fadeMs: 300,
  });
  const riseLabelOpacity = fadeOpacity({
    framesSinceBeatStart,
    fps,
    appear_s: 3.2,
    fadeMs: 300,
  });
  // Marching dashes: dashoffset cycles through the dash period so dashes
  // appear to flow along the leg. 10 = 6 (dash) + 4 (gap).
  const dashPeriod = 10;
  const dashOffset = -(tSec * 18) % dashPeriod;

  // Post-complete breath on the diagonal — gentle opacity throb.
  const lineComplete = lineProgress >= 1;
  const breathT = Math.max(0, tSec - 1.5);
  const lineBreath = lineComplete
    ? 1 - 0.06 * (1 + Math.sin(breathT * 2.6)) * 0.5
    : 1;

  return (
    <>
      <WireframeTerrainBackground opacity={0.9} />
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <filter
            id="diagGlow"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Diagonal line */}
        <line
          x1={A.x}
          y1={A.y}
          x2={lineEnd.x}
          y2={lineEnd.y}
          stroke="white"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={lineBreath}
          filter="url(#diagGlow)"
        />
        {/* Run leg — dashed, marches once drawn */}
        <line
          x1={A.x}
          y1={A.y}
          x2={runEnd.x}
          y2={runEnd.y}
          stroke="white"
          strokeOpacity={0.7}
          strokeWidth={2}
          strokeDasharray="6 4"
          strokeDashoffset={runProgress >= 1 ? dashOffset : 0}
        />
        {/* Rise leg — dashed, marches once drawn */}
        <line
          x1={C.x}
          y1={C.y}
          x2={riseEnd.x}
          y2={riseEnd.y}
          stroke="white"
          strokeOpacity={0.7}
          strokeWidth={2}
          strokeDasharray="6 4"
          strokeDashoffset={riseProgress >= 1 ? dashOffset : 0}
        />
        {/* Right-angle marker */}
        {runProgress > 0.6 && riseProgress > 0 ? (
          <rect
            x={C.x - 14}
            y={C.y - 14}
            width={14}
            height={14}
            fill="none"
            stroke="white"
            strokeOpacity={0.5}
            strokeWidth={1.5}
          />
        ) : null}
        {/* Run label */}
        <text
          x={(A.x + C.x) / 2}
          y={A.y + 28}
          fill="white"
          fontSize={22}
          fontFamily="ui-sans-serif, sans-serif"
          textAnchor="middle"
          opacity={runLabelOpacity}
        >
          {run_label}
        </text>
        {/* Rise label */}
        <text
          x={C.x + 14}
          y={(C.y + B.y) / 2 + 8}
          fill="white"
          fontSize={22}
          fontFamily="ui-sans-serif, sans-serif"
          opacity={riseLabelOpacity}
        >
          {rise_label}
        </text>
      </svg>
    </>
  );
}
