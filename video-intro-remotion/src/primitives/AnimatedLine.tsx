import { useCurrentFrame, useVideoConfig } from "remotion";
import { drawProgress, fadeOpacity } from "../utils/timing";
import { WireframeTerrainBackground } from "./WireframeTerrainBackground";

/**
 * Animated coordinate axes + slope lines.
 *
 * Each line draws itself from origin outward along its slope with a glowing
 * tip leading the stroke. Once a line settles, a bright pulse traces back
 * and forth along it and the line breathes gently. Axis ticks reveal with
 * a stagger so the grid feels constructed rather than dropped in.
 */
export function AnimatedLine({
  lines,
  axes_fade_in_ms = 1200,
  overlay_on = "blank",
  beatDurationFrames: _beatDurationFrames,
}: {
  lines: Array<{
    label: string;
    slope: number;
    intercept?: number;
    color?: string;
    draw_in_ms?: number;
  }>;
  axes_fade_in_ms?: number;
  overlay_on?: string;
  beatDurationFrames: number;
}) {
  const framesSinceBeatStart = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const tSec = framesSinceBeatStart / fps;
  const showBackground = overlay_on === "wireframe_terrain";

  const plotLeft = width * 0.18;
  const plotRight = width * 0.82;
  const plotBottom = height * 0.82;
  const plotTop = height * 0.18;
  const origin = { x: plotLeft + 80, y: plotBottom - 40 };

  const axesOpacity = fadeOpacity({
    framesSinceBeatStart,
    fps,
    appear_s: 0,
    disappear_s: undefined,
    fadeMs: axes_fade_in_ms,
  });

  const X_TICKS = 7;
  const Y_TICKS = 5;
  // Ticks reveal with a stagger after axes complete.
  const tickStartMs = axes_fade_in_ms - 200;

  return (
    <>
      {showBackground ? <WireframeTerrainBackground opacity={0.8} /> : null}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <filter id="lineGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter
            id="tipGlow"
            x="-200%"
            y="-200%"
            width="500%"
            height="500%"
          >
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Grid */}
        <g opacity={axesOpacity * 0.25}>
          {Array.from({ length: 8 }).map((_, i) => {
            const x = origin.x + ((plotRight - origin.x) * i) / 7;
            return (
              <line
                key={`vg${i}`}
                x1={x}
                y1={plotTop}
                x2={x}
                y2={plotBottom}
                stroke="white"
                strokeWidth={0.6}
              />
            );
          })}
          {Array.from({ length: 6 }).map((_, i) => {
            const y = origin.y - ((origin.y - plotTop) * i) / 5;
            return (
              <line
                key={`hg${i}`}
                x1={plotLeft}
                y1={y}
                x2={plotRight}
                y2={y}
                stroke="white"
                strokeWidth={0.6}
              />
            );
          })}
        </g>
        {/* Axes */}
        <g opacity={axesOpacity}>
          <line
            x1={origin.x}
            y1={origin.y}
            x2={origin.x}
            y2={plotTop}
            stroke="white"
            strokeWidth={2}
          />
          <line
            x1={origin.x}
            y1={origin.y}
            x2={plotRight}
            y2={origin.y}
            stroke="white"
            strokeWidth={2}
          />
          {/* X ticks — staggered reveal. */}
          {Array.from({ length: X_TICKS }).map((_, i) => {
            const x = origin.x + ((plotRight - origin.x) * (i + 1)) / X_TICKS;
            const op = drawProgress({
              framesSinceBeatStart,
              fps,
              startMs: tickStartMs + i * 70,
              durationMs: 220,
            });
            return (
              <line
                key={`xt${i}`}
                x1={x}
                y1={origin.y}
                x2={x}
                y2={origin.y + 8}
                stroke="white"
                strokeWidth={1.6}
                opacity={op}
              />
            );
          })}
          {/* Y ticks — staggered reveal. */}
          {Array.from({ length: Y_TICKS }).map((_, i) => {
            const y = origin.y - ((origin.y - plotTop) * (i + 1)) / Y_TICKS;
            const op = drawProgress({
              framesSinceBeatStart,
              fps,
              startMs: tickStartMs + i * 70,
              durationMs: 220,
            });
            return (
              <line
                key={`yt${i}`}
                x1={origin.x - 8}
                y1={y}
                x2={origin.x}
                y2={y}
                stroke="white"
                strokeWidth={1.6}
                opacity={op}
              />
            );
          })}
          <text
            x={origin.x - 18}
            y={plotTop + 6}
            fill="white"
            fontSize={22}
            fontFamily="ui-monospace, monospace"
          >
            y
          </text>
          <text
            x={plotRight - 6}
            y={origin.y + 28}
            fill="white"
            fontSize={22}
            fontFamily="ui-monospace, monospace"
          >
            x
          </text>
        </g>
        {/* Lines */}
        {lines.map((ln, i) => {
          const startMs = axes_fade_in_ms + i * 400;
          const drawMs = ln.draw_in_ms ?? 1800;
          const progress = drawProgress({
            framesSinceBeatStart,
            fps,
            startMs,
            durationMs: drawMs,
          });
          const maxXunits = (plotRight - origin.x) / 80;
          const maxYunits = (origin.y - plotTop) / 80;
          const xLimit = Math.min(maxXunits, maxYunits / Math.max(0.01, ln.slope));
          const endX = origin.x + xLimit * 80 * progress;
          const endY = origin.y - ln.slope * (xLimit * 80) * progress;
          // Pulse traveling back and forth along the line once drawn — sin
          // gives a smooth there-and-back-again.
          const pulseStartS = (startMs + drawMs) / 1000;
          const pulseT = Math.max(0, tSec - pulseStartS);
          const pulseCycle = 2.4;
          const pulseFrac = (Math.sin((pulseT / pulseCycle) * Math.PI * 2) + 1) / 2;
          const pulseX = origin.x + (endX - origin.x) * pulseFrac;
          const pulseY = origin.y + (endY - origin.y) * pulseFrac;
          const pulseOpacity =
            progress >= 1 ? Math.min(1, pulseT * 1.2) : 0;
          // Post-draw breath: line opacity gently throbs after completion.
          const breath =
            progress >= 1
              ? 1 - 0.08 * (1 + Math.sin(pulseT * 2.4)) * 0.5
              : 1;
          const labelOpacity = drawProgress({
            framesSinceBeatStart,
            fps,
            startMs: startMs + drawMs - 200,
            durationMs: 400,
          });
          return (
            <g key={i}>
              <line
                x1={origin.x}
                y1={origin.y}
                x2={endX}
                y2={endY}
                stroke={ln.color ?? "white"}
                strokeWidth={3}
                strokeLinecap="round"
                opacity={progress > 0 ? breath : 0}
                filter="url(#lineGlow)"
              />
              {/* Glowing tip during draw */}
              {progress > 0 && progress < 1 ? (
                <circle
                  cx={endX}
                  cy={endY}
                  r={5}
                  fill={ln.color ?? "white"}
                  filter="url(#tipGlow)"
                />
              ) : null}
              {/* Pulse traveling along the settled line */}
              {pulseOpacity > 0.01 ? (
                <circle
                  cx={pulseX}
                  cy={pulseY}
                  r={4}
                  fill="white"
                  fillOpacity={pulseOpacity * 0.85}
                  filter="url(#tipGlow)"
                />
              ) : null}
              <text
                x={endX + 12}
                y={endY - 4}
                fill={ln.color ?? "white"}
                fontSize={26}
                fontFamily="ui-monospace, monospace"
                opacity={labelOpacity}
              >
                {ln.label}
              </text>
            </g>
          );
        })}
      </svg>
    </>
  );
}
