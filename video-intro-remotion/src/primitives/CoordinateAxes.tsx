import { useCurrentFrame, useVideoConfig } from "remotion";
import { drawProgress, fadeOpacity } from "../utils/timing";
import { WireframeTerrainBackground } from "./WireframeTerrainBackground";

/**
 * 2D Cartesian coordinate axes — the foundation primitive for any
 * lesson intro that needs to plot, compare, or annotate functions
 * (linear, quadratic, exponential, …). Renders pre-computed x/y
 * ranges with optional grid, tick labels, axis labels, and quadrant
 * highlight.
 *
 * Animation:
 *   - x-axis draws left → right (450ms), y-axis bottom → top (450ms,
 *     starts 150ms after x so the L-shape feels constructed not
 *     dropped in).
 *   - Ticks stagger from origin outward (~60ms per tick).
 *   - Tick numeric labels fade in shortly after the last tick reveals.
 *   - Optional grid pulses subtly (same row-wave treatment as the
 *     wireframe terrain).
 *   - Optional quadrant highlight pulses in slowly.
 *
 * Designed to be drop-in beneath other primitives (AnimatedLine,
 * RiseRunCallout). For a beat that just shows axes without a line on
 * top, this primitive can be used standalone.
 */
export function CoordinateAxes({
  x_range = [-5, 5],
  y_range = [-5, 5],
  tick_interval = 1,
  show_grid = true,
  show_origin_label = true,
  axis_label_x = "x",
  axis_label_y = "y",
  highlight_quadrant,
  overlay_on = "blank",
  beatDurationFrames: _beatDurationFrames,
}: {
  x_range?: [number, number];
  y_range?: [number, number];
  tick_interval?: number;
  show_grid?: boolean;
  show_origin_label?: boolean;
  axis_label_x?: string;
  axis_label_y?: string;
  highlight_quadrant?: 1 | 2 | 3 | 4;
  overlay_on?: "wireframe_terrain" | "blank";
  beatDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const tSec = frame / fps;
  const showBackground = overlay_on === "wireframe_terrain";

  // Plot rect — leaves margin on all sides for labels.
  const plotLeft = width * 0.15;
  const plotRight = width * 0.85;
  const plotTop = height * 0.15;
  const plotBottom = height * 0.85;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  // Map data coords → screen coords.
  const [xMin, xMax] = x_range;
  const [yMin, yMax] = y_range;
  const sx = (x: number) => plotLeft + ((x - xMin) / (xMax - xMin)) * plotWidth;
  const sy = (y: number) => plotBottom - ((y - yMin) / (yMax - yMin)) * plotHeight;
  const originX = sx(0);
  const originY = sy(0);

  // Draw timings.
  const X_AXIS_START = 0;
  const X_AXIS_DUR = 450;
  const Y_AXIS_START = 150;
  const Y_AXIS_DUR = 450;
  const TICK_START = X_AXIS_START + X_AXIS_DUR + 100;
  const TICK_STAGGER = 60;
  const LABEL_FADE_START = 1200;

  const xAxisProgress = drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: X_AXIS_START,
    durationMs: X_AXIS_DUR,
  });
  const yAxisProgress = drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: Y_AXIS_START,
    durationMs: Y_AXIS_DUR,
  });
  const axisLabelOpacity = fadeOpacity({
    framesSinceBeatStart: frame,
    fps,
    appear_s: LABEL_FADE_START / 1000,
    fadeMs: 400,
  });

  // Generate tick positions. Filter to ticks inside the plot rect and
  // skip the origin (drawn separately as the "0" label if requested).
  const xTicks: number[] = [];
  for (
    let v = Math.ceil(xMin / tick_interval) * tick_interval;
    v <= xMax + 1e-9;
    v += tick_interval
  ) {
    if (Math.abs(v) > 1e-9) xTicks.push(Number(v.toFixed(6)));
  }
  const yTicks: number[] = [];
  for (
    let v = Math.ceil(yMin / tick_interval) * tick_interval;
    v <= yMax + 1e-9;
    v += tick_interval
  ) {
    if (Math.abs(v) > 1e-9) yTicks.push(Number(v.toFixed(6)));
  }

  // Quadrant highlight rect.
  const quadrantRect = (() => {
    if (!highlight_quadrant) return null;
    const left = highlight_quadrant === 1 || highlight_quadrant === 4 ? originX : plotLeft;
    const right = highlight_quadrant === 1 || highlight_quadrant === 4 ? plotRight : originX;
    const top = highlight_quadrant === 1 || highlight_quadrant === 2 ? plotTop : originY;
    const bottom = highlight_quadrant === 1 || highlight_quadrant === 2 ? originY : plotBottom;
    const pulseAlpha =
      0.07 + 0.05 * (1 + Math.sin(tSec * 1.6)) * 0.5;
    return { left, right, top, bottom, alpha: pulseAlpha };
  })();

  return (
    <>
      {showBackground ? <WireframeTerrainBackground opacity={0.6} /> : null}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <filter id="axesGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Quadrant highlight (pulse). Behind grid + axes. */}
        {quadrantRect ? (
          <rect
            x={quadrantRect.left}
            y={quadrantRect.top}
            width={quadrantRect.right - quadrantRect.left}
            height={quadrantRect.bottom - quadrantRect.top}
            fill="white"
            fillOpacity={quadrantRect.alpha}
          />
        ) : null}

        {/* Grid — fades up gently, then breathes. */}
        {show_grid ? (
          <g
            opacity={
              fadeOpacity({
                framesSinceBeatStart: frame,
                fps,
                appear_s: (X_AXIS_START + X_AXIS_DUR + 200) / 1000,
                fadeMs: 500,
              }) *
              (0.18 + 0.04 * (1 + Math.sin(tSec * 1.2)) * 0.5)
            }
          >
            {xTicks.map((v, i) => (
              <line
                key={`vg${i}`}
                x1={sx(v)}
                y1={plotTop}
                x2={sx(v)}
                y2={plotBottom}
                stroke="white"
                strokeWidth={0.6}
              />
            ))}
            {yTicks.map((v, i) => (
              <line
                key={`hg${i}`}
                x1={plotLeft}
                y1={sy(v)}
                x2={plotRight}
                y2={sy(v)}
                stroke="white"
                strokeWidth={0.6}
              />
            ))}
          </g>
        ) : null}

        {/* X axis — draws left → right with a glowing leading tip. */}
        <g filter="url(#axesGlow)">
          <line
            x1={plotLeft}
            y1={originY}
            x2={plotLeft + plotWidth * xAxisProgress}
            y2={originY}
            stroke="white"
            strokeWidth={2}
            strokeLinecap="round"
          />
          {xAxisProgress > 0 && xAxisProgress < 1 ? (
            <circle
              cx={plotLeft + plotWidth * xAxisProgress}
              cy={originY}
              r={4}
              fill="white"
            />
          ) : null}
        </g>

        {/* Y axis — draws bottom → top, slight delay after x. */}
        <g filter="url(#axesGlow)">
          <line
            x1={originX}
            y1={plotBottom}
            x2={originX}
            y2={plotBottom - plotHeight * yAxisProgress}
            stroke="white"
            strokeWidth={2}
            strokeLinecap="round"
          />
          {yAxisProgress > 0 && yAxisProgress < 1 ? (
            <circle
              cx={originX}
              cy={plotBottom - plotHeight * yAxisProgress}
              r={4}
              fill="white"
            />
          ) : null}
        </g>

        {/* Tick marks — stagger from origin outward (positive then negative). */}
        {xTicks.map((v, i) => {
          const distFromOrigin = Math.abs(v / tick_interval);
          const op = drawProgress({
            framesSinceBeatStart: frame,
            fps,
            startMs: TICK_START + distFromOrigin * TICK_STAGGER,
            durationMs: 220,
          });
          return (
            <line
              key={`xt${i}`}
              x1={sx(v)}
              y1={originY - 6}
              x2={sx(v)}
              y2={originY + 6}
              stroke="white"
              strokeWidth={1.6}
              opacity={op}
            />
          );
        })}
        {yTicks.map((v, i) => {
          const distFromOrigin = Math.abs(v / tick_interval);
          const op = drawProgress({
            framesSinceBeatStart: frame,
            fps,
            startMs: TICK_START + distFromOrigin * TICK_STAGGER,
            durationMs: 220,
          });
          return (
            <line
              key={`yt${i}`}
              x1={originX - 6}
              y1={sy(v)}
              x2={originX + 6}
              y2={sy(v)}
              stroke="white"
              strokeWidth={1.6}
              opacity={op}
            />
          );
        })}

        {/* Tick numeric labels — fade in together once ticks settle. */}
        <g opacity={axisLabelOpacity}>
          {xTicks.map((v, i) => (
            <text
              key={`xl${i}`}
              x={sx(v)}
              y={originY + 24}
              fill="white"
              fontSize={14}
              fontFamily="ui-monospace, monospace"
              textAnchor="middle"
              opacity={0.7}
            >
              {v}
            </text>
          ))}
          {yTicks.map((v, i) => (
            <text
              key={`yl${i}`}
              x={originX - 14}
              y={sy(v) + 4}
              fill="white"
              fontSize={14}
              fontFamily="ui-monospace, monospace"
              textAnchor="end"
              opacity={0.7}
            >
              {v}
            </text>
          ))}
          {show_origin_label ? (
            <text
              x={originX - 12}
              y={originY + 18}
              fill="white"
              fontSize={14}
              fontFamily="ui-monospace, monospace"
              textAnchor="end"
              opacity={0.6}
            >
              0
            </text>
          ) : null}
        </g>

        {/* Axis labels (x, y). */}
        <text
          x={plotRight - 6}
          y={originY - 12}
          fill="white"
          fontSize={22}
          fontFamily="ui-monospace, monospace"
          textAnchor="end"
          opacity={axisLabelOpacity}
        >
          {axis_label_x}
        </text>
        <text
          x={originX + 12}
          y={plotTop + 18}
          fill="white"
          fontSize={22}
          fontFamily="ui-monospace, monospace"
          opacity={axisLabelOpacity}
        >
          {axis_label_y}
        </text>
      </svg>
    </>
  );
}
