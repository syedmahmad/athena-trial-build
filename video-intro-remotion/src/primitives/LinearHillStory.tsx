import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { fadeOpacity } from "../utils/timing";
import { Basketball } from "./_shared/Basketball";

/**
 * Linear-equations wrap-up primitive: tells a single sustained
 * "basketball on a hill" analogy for slope-intercept form y = mx + b.
 *
 * The hill IS the line. The character + basketball are positioned on it.
 * Each beat picks a `phase` to surface one named value of the analogy:
 *   - character_idle: figure + ball at the y-intercept (top of the hill)
 *   - rolling: ball animates down the line from y-intercept to x-intercept
 *   - slope_arrows: right-1-down-|m| triangle on the line midpoint
 *   - y_intercept_glow: pulsing dot + (0, b) label at the y-axis crossing
 *   - x_intercept_catch: ball at x-intercept; figure has moved down to catch
 *   - celebration: figure at frame center, arms up, ball aloft; axes recede
 *
 * Aesthetic: white linework on black, matching the rest of the primitive
 * library. The figure is a bathroom-sign pictogram (head circle + boxy
 * limbs) — established iconography, not an attempted-photoreal stick figure.
 */
export function LinearHillStory({
  slope = -2,
  y_intercept = 3,
  x_range = [-0.5, 3.5],
  y_range = [-0.5, 5],
  phase = "character_idle",
  show_axes = true,
  show_equation_label = true,
  ball_position_x: _ball_position_x = 0,
  beatDurationFrames,
}: {
  slope?: number;
  y_intercept?: number;
  x_range?: [number, number];
  y_range?: [number, number];
  phase?:
    | "character_idle"
    | "rolling"
    | "slope_arrows"
    | "y_intercept_glow"
    | "x_intercept_catch"
    | "celebration";
  show_axes?: boolean;
  show_equation_label?: boolean;
  ball_position_x?: number;
  beatDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  const tSec = frame / fps;
  const beatDurS = beatDurationFrames / fps;

  // 1280×720 design canvas; primitives center on the same coord system
  const scaleX = width / 1280;
  const scaleY = height / 720;
  const sc = Math.min(scaleX, scaleY);

  // ── Plot area in canvas pixels (design space, scaled at render time) ──
  const plot = {
    x: 280 * scaleX,
    y: 80 * scaleY,
    w: 620 * scaleX,
    h: 540 * scaleY,
  };

  // ── Math → canvas transforms ──
  const xLo = x_range[0];
  const xHi = x_range[1];
  const yLo = y_range[0];
  const yHi = y_range[1];
  const toX = (mx: number) =>
    plot.x + ((mx - xLo) / (xHi - xLo)) * plot.w;
  const toY = (my: number) =>
    plot.y + plot.h - ((my - yLo) / (yHi - yLo)) * plot.h;

  // ── Key math points ──
  const xIntercept = -y_intercept / slope; // where y = mx + b crosses y = 0
  const lineY = (mx: number) => slope * mx + y_intercept;

  // Visible segment of the line (clamped to plot range)
  const lineX1 = Math.max(xLo, (yHi - y_intercept) / slope);
  const lineX2 = Math.min(xHi, (yLo - y_intercept) / slope);
  const segStart = { x: Math.min(lineX1, lineX2), y: 0 };
  const segEnd = { x: Math.max(lineX1, lineX2), y: 0 };
  segStart.y = lineY(segStart.x);
  segEnd.y = lineY(segEnd.x);

  // ── Subtle global "living" shimmer (mild brightness wobble) ──
  const shimmerLine = 0.92 + 0.08 * Math.sin(tSec * 1.6 + 0.7);

  // ── Phase-driven derived positions ──
  // Ball position in math coords (varies by phase). For "rolling", ball
  // animates from y-intercept (0, b) to x-intercept (xIntercept, 0) over
  // the beat duration with an ease-in (gravity-ish).
  const rollProgress = interpolate(frame, [0, beatDurationFrames], [0, 1], {
    easing: Easing.in(Easing.quad),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  let ballMathX = 0;
  switch (phase) {
    case "character_idle":
      ballMathX = 0; // ball held at the y-intercept
      break;
    case "rolling":
      ballMathX = 0 + rollProgress * (xIntercept - 0);
      break;
    case "slope_arrows":
    case "y_intercept_glow":
      ballMathX = 0; // ball still at y-intercept
      break;
    case "x_intercept_catch":
      ballMathX = xIntercept;
      break;
    case "celebration":
      ballMathX = 0; // not used in celebration phase
      break;
  }
  const ballMathY = lineY(ballMathX);

  // Figure position (math coords). Stands ON the line — feet at (figX, figY).
  let figMathX = 0;
  let figMathY = y_intercept;
  let figPose: "standing" | "arms_up" = "standing";
  let figVisible = true;
  let figCelebrationCenter = false; // celebration uses frame-center, not line position

  switch (phase) {
    case "x_intercept_catch":
      figMathX = xIntercept;
      figMathY = 0;
      break;
    case "celebration":
      figPose = "arms_up";
      figCelebrationCenter = true;
      break;
    case "y_intercept_glow":
      // figure dims slightly to keep focus on the axis crossing
      break;
    default:
      break;
  }

  // Visual emphasis dimming
  const focusDim = phase === "y_intercept_glow" ? 0.45 : 1;

  // ── Axes/line/figure fade-ins (everything starts visible quickly) ──
  const baseFade = fadeOpacity({
    framesSinceBeatStart: frame,
    fps,
    appear_s: 0,
    fadeMs: 300,
  });

  // Celebration phase: line + axes recede in opacity ~halfway through the beat
  const celebRecede =
    phase === "celebration"
      ? interpolate(tSec, [0, beatDurS * 0.4], [1, 0.35], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  // ── Y-intercept glow pulse ──
  const glowPulse =
    phase === "y_intercept_glow"
      ? 0.65 + 0.35 * Math.sin(tSec * 3.4)
      : 0;
  const glowRadius = 18 + glowPulse * 14;

  // ── Slope-arrows midpoint position ──
  // Pick a midpoint along the line for the slope marker — visible to viewer
  const slopeMidX = (segStart.x + segEnd.x) / 2;
  const slopeMidY = lineY(slopeMidX);
  // Marker spans 1 unit right + |slope| units down from this point
  const slopeRightX = slopeMidX + 1;
  const slopeDownY = slopeMidY + slope * 1; // since slope<0, this goes DOWN visually

  const equationText = formatLinearEquation(slope, y_intercept);
  const ballRadius = 16 * sc;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0 }}
    >
      <defs>
        <filter id="lhsGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="lhsBallGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="lhsCyanGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── Axes ── */}
      {show_axes && (
        <g opacity={baseFade * celebRecede}>
          <Axes
            plot={plot}
            xRange={x_range}
            yRange={y_range}
            sc={sc}
            opacity={0.55}
          />
        </g>
      )}

      {/* ── The line (the "hill") ── */}
      <line
        x1={toX(segStart.x)}
        y1={toY(segStart.y)}
        x2={toX(segEnd.x)}
        y2={toY(segEnd.y)}
        stroke="white"
        strokeWidth={3 * sc}
        strokeLinecap="round"
        opacity={0.95 * shimmerLine * baseFade * celebRecede}
        filter="url(#lhsGlow)"
      />

      {/* ── Slope-arrows overlay (phase: slope_arrows) ── */}
      {phase === "slope_arrows" && (
        <SlopeArrows
          toX={toX}
          toY={toY}
          startX={slopeMidX}
          startY={slopeMidY}
          rightX={slopeRightX}
          downY={slopeDownY}
          slope={slope}
          sc={sc}
          fade={fadeOpacity({
            framesSinceBeatStart: frame,
            fps,
            appear_s: 0.3,
            fadeMs: 400,
          })}
        />
      )}

      {/* ── Y-intercept glow + label (phase: y_intercept_glow) ── */}
      {phase === "y_intercept_glow" && (
        <g opacity={baseFade}>
          {/* Outer pulse */}
          <circle
            cx={toX(0)}
            cy={toY(y_intercept)}
            r={glowRadius * sc}
            fill="none"
            stroke="rgb(120, 220, 255)"
            strokeWidth={2 * sc}
            opacity={0.5 + 0.3 * glowPulse}
            filter="url(#lhsCyanGlow)"
          />
          {/* Inner solid dot */}
          <circle
            cx={toX(0)}
            cy={toY(y_intercept)}
            r={6 * sc}
            fill="white"
            opacity={0.95}
          />
          {/* Label */}
          <text
            x={toX(0) + 16 * sc}
            y={toY(y_intercept) - 14 * sc}
            fill="white"
            fontSize={20 * sc}
            fontFamily="ui-monospace, monospace"
            textAnchor="start"
            opacity={0.95}
          >
            (0, {y_intercept})
          </text>
        </g>
      )}

      {/* ── X-intercept dot + label (phase: x_intercept_catch) ── */}
      {phase === "x_intercept_catch" && (
        <g opacity={baseFade}>
          <circle
            cx={toX(xIntercept)}
            cy={toY(0)}
            r={6 * sc}
            fill="white"
            opacity={0.95}
          />
          <text
            x={toX(xIntercept) + 14 * sc}
            y={toY(0) - 18 * sc}
            fill="white"
            fontSize={18 * sc}
            fontFamily="ui-monospace, monospace"
            textAnchor="start"
            opacity={0.9}
          >
            ({formatNumber(xIntercept)}, 0)
          </text>
        </g>
      )}

      {/* ── Bathroom-sign figure ── */}
      {figVisible && (
        <BathroomSignFigure
          cx={
            figCelebrationCenter
              ? width / 2
              : toX(figMathX)
          }
          feetY={
            figCelebrationCenter
              ? height * 0.62
              : toY(figMathY)
          }
          scale={1.2 * sc}
          pose={figPose}
          opacity={baseFade * focusDim}
          showBasketballOverhead={phase === "celebration"}
          ballRadius={ballRadius}
        />
      )}

      {/* ── Basketball (separate from figure) — for non-celebration phases ── */}
      {phase !== "celebration" && (
        <Basketball
          cx={toX(ballMathX) + (phase === "character_idle" ? 18 * sc : 0)}
          cy={toY(ballMathY) - 16 * sc}
          r={ballRadius}
          rotationDeg={
            phase === "rolling" ? rollProgress * 540 : 0
          }
          sc={sc}
          shimmer={shimmerLine}
          glowFilterId="lhsBallGlow"
          outerOpacity={0.9 * baseFade * focusDim}
          seamOpacity={0.55 * baseFade * focusDim}
        />
      )}

      {/* ── Equation label (top-right) ── */}
      {show_equation_label && (
        <g
          opacity={
            baseFade *
            (phase === "celebration" ? celebRecede : 1)
          }
        >
          <text
            x={width - 80 * sc}
            y={70 * sc}
            fill="white"
            fontSize={26 * sc}
            fontFamily="ui-monospace, monospace"
            textAnchor="end"
            opacity={0.85}
          >
            {equationText}
          </text>
        </g>
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function Axes({
  plot,
  xRange,
  yRange,
  sc,
  opacity,
}: {
  plot: { x: number; y: number; w: number; h: number };
  xRange: [number, number];
  yRange: [number, number];
  sc: number;
  opacity: number;
}) {
  const [xLo, xHi] = xRange;
  const [yLo, yHi] = yRange;
  const toX = (mx: number) =>
    plot.x + ((mx - xLo) / (xHi - xLo)) * plot.w;
  const toY = (my: number) =>
    plot.y + plot.h - ((my - yLo) / (yHi - yLo)) * plot.h;

  // X axis at y = 0 (or y = yLo if 0 not in range)
  const xAxisY = yLo <= 0 && 0 <= yHi ? toY(0) : toY(yLo);
  // Y axis at x = 0
  const yAxisX = xLo <= 0 && 0 <= xHi ? toX(0) : toX(xLo);

  // Integer ticks
  const xTicks: number[] = [];
  for (let k = Math.ceil(xLo); k <= Math.floor(xHi); k++) xTicks.push(k);
  const yTicks: number[] = [];
  for (let k = Math.ceil(yLo); k <= Math.floor(yHi); k++) yTicks.push(k);

  return (
    <g opacity={opacity}>
      {/* X axis */}
      <line
        x1={plot.x}
        y1={xAxisY}
        x2={plot.x + plot.w}
        y2={xAxisY}
        stroke="white"
        strokeWidth={1.5 * sc}
        opacity={0.7}
      />
      {/* Y axis */}
      <line
        x1={yAxisX}
        y1={plot.y}
        x2={yAxisX}
        y2={plot.y + plot.h}
        stroke="white"
        strokeWidth={1.5 * sc}
        opacity={0.7}
      />
      {/* Axis labels */}
      <text
        x={plot.x + plot.w + 14 * sc}
        y={xAxisY + 6 * sc}
        fill="white"
        fontSize={18 * sc}
        fontFamily="ui-monospace, monospace"
        opacity={0.7}
      >
        x
      </text>
      <text
        x={yAxisX - 6 * sc}
        y={plot.y - 8 * sc}
        fill="white"
        fontSize={18 * sc}
        fontFamily="ui-monospace, monospace"
        textAnchor="end"
        opacity={0.7}
      >
        y
      </text>
      {/* X ticks */}
      {xTicks.map((k) => (
        <g key={`xt-${k}`}>
          <line
            x1={toX(k)}
            y1={xAxisY - 5 * sc}
            x2={toX(k)}
            y2={xAxisY + 5 * sc}
            stroke="white"
            strokeWidth={1 * sc}
            opacity={0.7}
          />
          <text
            x={toX(k)}
            y={xAxisY + 22 * sc}
            fill="white"
            fontSize={14 * sc}
            fontFamily="ui-monospace, monospace"
            textAnchor="middle"
            opacity={0.55}
          >
            {k}
          </text>
        </g>
      ))}
      {/* Y ticks */}
      {yTicks.map((k) => (
        <g key={`yt-${k}`}>
          <line
            x1={yAxisX - 5 * sc}
            y1={toY(k)}
            x2={yAxisX + 5 * sc}
            y2={toY(k)}
            stroke="white"
            strokeWidth={1 * sc}
            opacity={0.7}
          />
          {k !== 0 && (
            <text
              x={yAxisX - 10 * sc}
              y={toY(k) + 5 * sc}
              fill="white"
              fontSize={14 * sc}
              fontFamily="ui-monospace, monospace"
              textAnchor="end"
              opacity={0.55}
            >
              {k}
            </text>
          )}
        </g>
      ))}
    </g>
  );
}

function SlopeArrows({
  toX,
  toY,
  startX,
  startY,
  rightX,
  downY,
  slope,
  sc,
  fade,
}: {
  toX: (mx: number) => number;
  toY: (my: number) => number;
  startX: number;
  startY: number;
  rightX: number;
  downY: number;
  slope: number;
  sc: number;
  fade: number;
}) {
  // Right arrow: from (startX, startY) to (rightX, startY)
  // Down arrow: from (rightX, startY) to (rightX, downY)
  const startCanvasX = toX(startX);
  const startCanvasY = toY(startY);
  const cornerCanvasX = toX(rightX);
  const cornerCanvasY = toY(startY);
  const endCanvasX = toX(rightX);
  const endCanvasY = toY(downY);

  const headSize = 10 * sc;

  return (
    <g opacity={fade}>
      {/* Horizontal "right 1" arrow */}
      <line
        x1={startCanvasX}
        y1={startCanvasY}
        x2={cornerCanvasX - headSize}
        y2={cornerCanvasY}
        stroke="rgb(120, 220, 255)"
        strokeWidth={2.5 * sc}
        opacity={0.95}
      />
      {/* Arrow head right */}
      <polygon
        points={`
          ${cornerCanvasX},${cornerCanvasY}
          ${cornerCanvasX - headSize},${cornerCanvasY - headSize * 0.6}
          ${cornerCanvasX - headSize},${cornerCanvasY + headSize * 0.6}
        `}
        fill="rgb(120, 220, 255)"
        opacity={0.95}
      />
      {/* "right 1" label */}
      <text
        x={(startCanvasX + cornerCanvasX) / 2}
        y={cornerCanvasY - 10 * sc}
        fill="rgb(120, 220, 255)"
        fontSize={18 * sc}
        fontFamily="ui-monospace, monospace"
        textAnchor="middle"
        opacity={0.95}
      >
        right 1
      </text>

      {/* Vertical "down |slope|" arrow */}
      <line
        x1={cornerCanvasX}
        y1={cornerCanvasY}
        x2={endCanvasX}
        y2={endCanvasY - headSize}
        stroke="rgb(120, 220, 255)"
        strokeWidth={2.5 * sc}
        opacity={0.95}
      />
      {/* Arrow head down */}
      <polygon
        points={`
          ${endCanvasX},${endCanvasY}
          ${endCanvasX - headSize * 0.6},${endCanvasY - headSize}
          ${endCanvasX + headSize * 0.6},${endCanvasY - headSize}
        `}
        fill="rgb(120, 220, 255)"
        opacity={0.95}
      />
      {/* "down |slope|" label */}
      <text
        x={cornerCanvasX + 14 * sc}
        y={(cornerCanvasY + endCanvasY) / 2}
        fill="rgb(120, 220, 255)"
        fontSize={18 * sc}
        fontFamily="ui-monospace, monospace"
        textAnchor="start"
        dominantBaseline="middle"
        opacity={0.95}
      >
        down {Math.abs(slope)}
      </text>
    </g>
  );
}

function BathroomSignFigure({
  cx,
  feetY,
  scale,
  pose,
  opacity,
  showBasketballOverhead,
  ballRadius,
}: {
  cx: number;
  feetY: number;
  scale: number;
  pose: "standing" | "arms_up";
  opacity: number;
  showBasketballOverhead: boolean;
  ballRadius: number;
}) {
  const s = scale;
  // Figure-local origin: torso vertical center.
  // Figure total height ≈ 78 design pixels at scale 1: head r=8 (-38 to -22),
  // torso (-20 to +10), legs (+10 to +32). Feet land at center + 32s.
  const centerY = feetY - 32 * s;

  const stroke = 2.5 * s;
  const ballAboveY = centerY - 56 * s;

  return (
    <g opacity={opacity}>
      {/* Head */}
      <circle
        cx={cx}
        cy={centerY - 30 * s}
        r={8 * s}
        fill="none"
        stroke="white"
        strokeWidth={stroke}
      />
      {/* Torso (rounded rect) */}
      <rect
        x={cx - 10 * s}
        y={centerY - 20 * s}
        width={20 * s}
        height={30 * s}
        rx={3 * s}
        ry={3 * s}
        fill="none"
        stroke="white"
        strokeWidth={stroke}
      />
      {/* Arms */}
      {pose === "standing" ? (
        <>
          <rect
            x={cx - 19 * s}
            y={centerY - 18 * s}
            width={7 * s}
            height={24 * s}
            rx={2 * s}
            ry={2 * s}
            fill="none"
            stroke="white"
            strokeWidth={stroke}
          />
          <rect
            x={cx + 12 * s}
            y={centerY - 18 * s}
            width={7 * s}
            height={24 * s}
            rx={2 * s}
            ry={2 * s}
            fill="none"
            stroke="white"
            strokeWidth={stroke}
          />
        </>
      ) : (
        // arms_up: angled rectangles extending up and out, hands above head
        <>
          <path
            d={`
              M ${cx - 8 * s} ${centerY - 18 * s}
              L ${cx - 22 * s} ${centerY - 44 * s}
              L ${cx - 14 * s} ${centerY - 50 * s}
              L ${cx - 3 * s} ${centerY - 22 * s}
              Z
            `}
            fill="none"
            stroke="white"
            strokeWidth={stroke}
            strokeLinejoin="round"
          />
          <path
            d={`
              M ${cx + 8 * s} ${centerY - 18 * s}
              L ${cx + 22 * s} ${centerY - 44 * s}
              L ${cx + 14 * s} ${centerY - 50 * s}
              L ${cx + 3 * s} ${centerY - 22 * s}
              Z
            `}
            fill="none"
            stroke="white"
            strokeWidth={stroke}
            strokeLinejoin="round"
          />
        </>
      )}
      {/* Legs */}
      <rect
        x={cx - 8 * s}
        y={centerY + 10 * s}
        width={6 * s}
        height={22 * s}
        rx={2 * s}
        ry={2 * s}
        fill="none"
        stroke="white"
        strokeWidth={stroke}
      />
      <rect
        x={cx + 2 * s}
        y={centerY + 10 * s}
        width={6 * s}
        height={22 * s}
        rx={2 * s}
        ry={2 * s}
        fill="none"
        stroke="white"
        strokeWidth={stroke}
      />
      {/* Basketball held overhead (celebration pose only) */}
      {pose === "arms_up" && showBasketballOverhead && (
        <Basketball
          cx={cx}
          cy={ballAboveY}
          r={ballRadius}
          sc={s}
          glowFilterId="lhsBallGlow"
        />
      )}
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function formatLinearEquation(m: number, b: number): string {
  // Produce a clean "y = mx + b" string handling signs and 1/-1 coefficients.
  const mStr =
    m === 1 ? "x" : m === -1 ? "−x" : `${formatNumber(m)}x`;
  if (b === 0) return `y = ${mStr}`;
  const bSign = b >= 0 ? "+" : "−";
  return `y = ${mStr} ${bSign} ${formatNumber(Math.abs(b))}`;
}

function formatNumber(n: number): string {
  // Strip trailing .0; keep up to 2 decimal places otherwise
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}
