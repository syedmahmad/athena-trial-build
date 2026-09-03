import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { drawProgress, fadeOpacity } from "../utils/timing";
import { WireframeTerrainBackground } from "./WireframeTerrainBackground";

/**
 * Compare two fractions side-by-side. Each fraction can render as a
 * filled horizontal bar (default), a pie chart, or both stacked. The
 * comparison operator (`<`, `>`, `=`) appears between them once both
 * sides have settled — auto-derived from the numeric values unless
 * the caller overrides.
 *
 * Animation:
 *   - Left side fills (550ms), right side fills (550ms, 200ms after
 *     left).
 *   - Operator pops in (320ms) once both sides are at ~75% fill.
 *   - The "larger" side gets a subtle scale + brightness pulse to draw
 *     the eye after settle.
 */
type FractionSpec = {
  num: number;
  denom: number;
  label?: string;
};

export function FractionCompare({
  left,
  right,
  operator,
  style = "bar",
  overlay_on = "blank",
  beatDurationFrames: _beatDurationFrames,
}: {
  left: FractionSpec;
  right: FractionSpec;
  operator?: "<" | ">" | "=" | "auto";
  style?: "bar" | "pie" | "both";
  overlay_on?: "wireframe_terrain" | "blank";
  beatDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const tSec = frame / fps;
  const showBackground = overlay_on === "wireframe_terrain";

  // Resolve operator. Auto: compare numeric value.
  const resolvedOperator: "<" | ">" | "=" = (() => {
    if (operator && operator !== "auto") return operator;
    const lv = left.num / Math.max(1e-9, left.denom);
    const rv = right.num / Math.max(1e-9, right.denom);
    if (Math.abs(lv - rv) < 1e-9) return "=";
    return lv < rv ? "<" : ">";
  })();

  const leftFrac = left.num / Math.max(1e-9, left.denom);
  const rightFrac = right.num / Math.max(1e-9, right.denom);
  const leftFracClamped = Math.min(1, Math.max(0, leftFrac));
  const rightFracClamped = Math.min(1, Math.max(0, rightFrac));

  // Layout: two cells side-by-side, operator centered in the gap.
  const cellWidth = width * 0.32;
  const gap = width * 0.05;
  const totalWidth = cellWidth * 2 + gap;
  const cellLeftX = (width - totalWidth) / 2;
  const cellRightX = cellLeftX + cellWidth + gap;
  const operatorX = cellLeftX + cellWidth + gap / 2;
  const centerY = height * 0.5;

  // Timing.
  const LEFT_FILL_START = 200;
  const RIGHT_FILL_START = 400;
  const FILL_DUR = 550;
  const OPERATOR_START = LEFT_FILL_START + FILL_DUR * 0.75;
  const LABEL_FADE_START = 0;

  const leftFillProgress = drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: LEFT_FILL_START,
    durationMs: FILL_DUR,
  });
  const rightFillProgress = drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: RIGHT_FILL_START,
    durationMs: FILL_DUR,
  });
  const labelOpacity = fadeOpacity({
    framesSinceBeatStart: frame,
    fps,
    appear_s: LABEL_FADE_START / 1000,
    fadeMs: 350,
  });
  const operatorOpacity = fadeOpacity({
    framesSinceBeatStart: frame,
    fps,
    appear_s: OPERATOR_START / 1000,
    fadeMs: 320,
  });
  const operatorScale = interpolate(
    operatorOpacity,
    [0, 1],
    [0.55, 1.0],
    {
      easing: Easing.out(Easing.back(2.2)),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  // Post-settle pulse on the "larger" side.
  const bothSettled =
    leftFillProgress >= 1 && rightFillProgress >= 1 && operatorOpacity >= 1;
  const pulseT = bothSettled ? tSec - (OPERATOR_START / 1000 + 0.32) : 0;
  const pulseFactor = bothSettled
    ? 1 + 0.04 * Math.sin(pulseT * 1.8)
    : 1;
  const leftPulse = resolvedOperator === ">" ? pulseFactor : 1;
  const rightPulse = resolvedOperator === "<" ? pulseFactor : 1;
  const leftBrightness =
    resolvedOperator === ">" && bothSettled
      ? 0.92 + 0.08 * (1 + Math.sin(pulseT * 1.8)) * 0.5
      : 1;
  const rightBrightness =
    resolvedOperator === "<" && bothSettled
      ? 0.92 + 0.08 * (1 + Math.sin(pulseT * 1.8)) * 0.5
      : 1;

  const showBar = style === "bar" || style === "both";
  const showPie = style === "pie" || style === "both";

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
          <filter id="fcGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* LEFT side */}
        <FractionVisual
          x={cellLeftX}
          y={centerY}
          width={cellWidth}
          showBar={showBar}
          showPie={showPie}
          fillProgress={leftFillProgress}
          fraction={leftFracClamped}
          spec={left}
          labelOpacity={labelOpacity}
          pulseScale={leftPulse}
          brightness={leftBrightness}
        />

        {/* OPERATOR */}
        <text
          x={operatorX}
          y={centerY + 12}
          fill="white"
          fontSize={64}
          fontFamily="ui-monospace, monospace"
          textAnchor="middle"
          opacity={operatorOpacity}
          transform={`translate(${operatorX} ${centerY + 12}) scale(${operatorScale}) translate(${-operatorX} ${-(centerY + 12)})`}
          filter="url(#fcGlow)"
        >
          {resolvedOperator}
        </text>

        {/* RIGHT side */}
        <FractionVisual
          x={cellRightX}
          y={centerY}
          width={cellWidth}
          showBar={showBar}
          showPie={showPie}
          fillProgress={rightFillProgress}
          fraction={rightFracClamped}
          spec={right}
          labelOpacity={labelOpacity}
          pulseScale={rightPulse}
          brightness={rightBrightness}
        />
      </svg>
    </>
  );
}

/** Render one side: fraction label on top, bar/pie below. */
function FractionVisual({
  x,
  y,
  width,
  showBar,
  showPie,
  fillProgress,
  fraction,
  spec,
  labelOpacity,
  pulseScale,
  brightness,
}: {
  x: number;
  y: number;
  width: number;
  showBar: boolean;
  showPie: boolean;
  fillProgress: number;
  fraction: number;
  spec: FractionSpec;
  labelOpacity: number;
  pulseScale: number;
  brightness: number;
}) {
  const barHeight = 36;
  const pieRadius = 56;
  const labelY = y - 70;
  const captionY = y + (showBar ? barHeight + 40 : pieRadius + 40);

  // Apply scale around the center of this side.
  const cx = x + width / 2;
  const cy = y;

  return (
    <g
      transform={`translate(${cx} ${cy}) scale(${pulseScale}) translate(${-cx} ${-cy})`}
    >
      {/* Top fraction label e.g. "3/4" */}
      <g opacity={labelOpacity}>
        <text
          x={cx}
          y={labelY}
          fill="white"
          fontSize={42}
          fontFamily="ui-monospace, monospace"
          textAnchor="middle"
          opacity={brightness}
        >
          {`${spec.num}/${spec.denom}`}
        </text>
      </g>

      {/* Bar */}
      {showBar ? (
        <g>
          {/* Outer rect (denominator). */}
          <rect
            x={x}
            y={y}
            width={width}
            height={barHeight}
            fill="none"
            stroke="white"
            strokeWidth={1.6}
            opacity={0.6}
          />
          {/* Filled portion (numerator * progress). */}
          <rect
            x={x}
            y={y}
            width={width * fraction * fillProgress}
            height={barHeight}
            fill="white"
            opacity={0.85 * brightness}
          />
          {/* Tick marks at each denominator division. */}
          {Array.from({ length: spec.denom - 1 }).map((_, i) => {
            const tx = x + (width * (i + 1)) / spec.denom;
            return (
              <line
                key={`tk${i}`}
                x1={tx}
                y1={y}
                x2={tx}
                y2={y + barHeight}
                stroke="black"
                strokeOpacity={0.45}
                strokeWidth={1.2}
              />
            );
          })}
        </g>
      ) : null}

      {/* Pie chart variant — full circle outline + filled sector. */}
      {showPie ? (
        <g transform={`translate(0 ${showBar ? barHeight + 80 : 0})`}>
          <circle
            cx={cx}
            cy={y}
            r={pieRadius}
            fill="none"
            stroke="white"
            strokeWidth={1.6}
            opacity={0.6}
          />
          <path
            d={pieSlicePath(cx, y, pieRadius, fraction * fillProgress)}
            fill="white"
            opacity={0.85 * brightness}
          />
        </g>
      ) : null}

      {/* Optional caption underneath. */}
      {spec.label ? (
        <text
          x={cx}
          y={captionY}
          fill="white"
          fontSize={18}
          fontFamily="ui-monospace, monospace"
          textAnchor="middle"
          opacity={labelOpacity * 0.7}
        >
          {spec.label}
        </text>
      ) : null}
    </g>
  );
}

/** Build an SVG path for a pie slice of `fraction` (0..1) of the circle. */
function pieSlicePath(cx: number, cy: number, r: number, fraction: number): string {
  if (fraction <= 0) return "";
  if (fraction >= 1) {
    // Full circle as two arcs to avoid a degenerate single arc.
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  }
  const angle = fraction * Math.PI * 2;
  const x = cx + r * Math.sin(angle);
  const y = cy - r * Math.cos(angle);
  const largeArc = fraction > 0.5 ? 1 : 0;
  return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${x} ${y} Z`;
}
