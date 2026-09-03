import { useCurrentFrame, useVideoConfig } from "remotion";
import { drawProgress, fadeOpacity } from "../utils/timing";

/**
 * Plots a rational function P(x)/Q(x) on coordinate axes, highlighting key features like vertical asymptotes, peaks, and undefined regions. The curve traces smoothly while avoiding discontinuities.
 */
export function RationalFunctionPlot({
  numerator_degree,
  denominator_degree,
  show_asymptotes = false,
  show_peak_marker = false,
  highlight_undefined_regions = false,
  animation = "static",
  beatDurationFrames: _beatDurationFrames,
}: {
  numerator_degree: number;
  denominator_degree: number;
  show_asymptotes?: boolean;
  show_peak_marker?: boolean;
  highlight_undefined_regions?: boolean;
  animation?: string;
  beatDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const tSec = frame / fps;

  // Generate rational function curve based on degrees
  const generateCurvePath = () => {
    // Asymptote position varies based on degree ratio
    const asymptoteX = width * (0.4 + 0.2 * (denominator_degree / Math.max(1, numerator_degree + denominator_degree)));
    
    // Shape varies with numerator/denominator degree
    const leftCurvature = numerator_degree > denominator_degree ? "sharp" : "gentle";
    const rightBehavior = denominator_degree > numerator_degree ? "horizontal" : "rising";
    
    const leftStartY = height * (0.3 + 0.1 * (numerator_degree % 3));
    const rightEndY = rightBehavior === "horizontal" ? height * 0.5 : height * (0.2 + 0.15 * numerator_degree);
    
    // Left branch - approaches asymptote from negative side
    const leftPath = leftCurvature === "sharp" 
      ? `M ${asymptoteX - 240} ${leftStartY} Q ${asymptoteX - 120} ${height * 0.25} ${asymptoteX - 60} ${height * 0.15} Q ${asymptoteX - 20} ${height * 0.4} ${asymptoteX - 8} ${height * 0.8}`
      : `M ${asymptoteX - 240} ${leftStartY} Q ${asymptoteX - 150} ${height * 0.4} ${asymptoteX - 80} ${height * 0.35} Q ${asymptoteX - 30} ${height * 0.5} ${asymptoteX - 8} ${height * 0.7}`;
    
    // Right branch - starts after asymptote gap
    const rightPath = rightBehavior === "horizontal"
      ? `M ${asymptoteX + 8} ${height * 0.2} Q ${asymptoteX + 80} ${height * 0.25} ${asymptoteX + 160} ${height * 0.3} Q ${asymptoteX + 220} ${rightEndY} ${asymptoteX + 280} ${rightEndY}`
      : `M ${asymptoteX + 8} ${height * 0.15} Q ${asymptoteX + 60} ${height * 0.2} ${asymptoteX + 120} ${height * 0.3} Q ${asymptoteX + 200} ${height * 0.4} ${asymptoteX + 280} ${rightEndY}`;
    
    return { leftPath, rightPath, asymptoteX };
  };

  const { leftPath, rightPath, asymptoteX } = generateCurvePath();

  // Animation timing - asymptote first, region fade, then curves, then features
  const ASYMPTOTE_START = 0;
  const ASYMPTOTE_DUR = 400;
  const REGION_START = 200;
  const LEFT_CURVE_START = 600;
  const LEFT_CURVE_DUR = 600;
  const RIGHT_CURVE_START = LEFT_CURVE_START + 400; // Pause at discontinuity
  const RIGHT_CURVE_DUR = 600;
  const FEATURES_START = RIGHT_CURVE_START + 300;

  // Reveal animations
  const asymptoteOpacity = animation === "static" ? 1 : fadeOpacity({
    framesSinceBeatStart: frame,
    fps,
    appear_s: ASYMPTOTE_START / 1000,
    fadeMs: ASYMPTOTE_DUR,
  });

  const regionOpacity = animation === "static" ? 1 : fadeOpacity({
    framesSinceBeatStart: frame,
    fps,
    appear_s: REGION_START / 1000,
    fadeMs: 400,
  });

  const leftCurveProgress = animation === "static" ? 1 : drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: LEFT_CURVE_START,
    durationMs: LEFT_CURVE_DUR,
  });

  const rightCurveProgress = animation === "static" ? 1 : drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: RIGHT_CURVE_START,
    durationMs: RIGHT_CURVE_DUR,
  });

  const featuresOpacity = animation === "static" ? 1 : fadeOpacity({
    framesSinceBeatStart: frame,
    fps,
    appear_s: FEATURES_START / 1000,
    fadeMs: 400,
  });

  // Peak marker pulse when curve reaches it
  const peakPulseTime = (LEFT_CURVE_START + LEFT_CURVE_DUR * 0.3) / 1000;
  const peakPulse = Math.abs(tSec - peakPulseTime) < 0.2 ? 
    1 + 0.5 * Math.sin((tSec - peakPulseTime) * Math.PI * 5) : 1;

  // Living treatment - shimmer per element
  const axesShimmer = 0.85 + 0.15 * Math.sin(tSec * 1.8);
  const asymptoteShimmer = 0.85 + 0.15 * Math.sin(tSec * 1.8 + 0.31);
  const curveShimmer = 0.85 + 0.15 * Math.sin(tSec * 1.8 + 0.62);
  const regionShimmer = 0.85 + 0.15 * Math.sin(tSec * 1.8 + 0.93);
  const labelShimmer = 0.85 + 0.15 * Math.sin(tSec * 1.8 + 1.24);

  // Jitter per element group
  const axesJx = Math.cos(tSec * 1.3) * 0.4;
  const axesJy = Math.sin(tSec * 1.1) * 0.3;
  const asymptoteJx = Math.cos(0.31 * 1.7 + tSec * 1.3) * 0.4;
  const curveJx = Math.cos(0.62 * 1.7 + tSec * 1.3) * 0.4;
  const curveJy = Math.sin(0.62 * 2.1 + tSec * 1.1) * 0.3;
  const regionJx = Math.cos(0.93 * 1.7 + tSec * 1.3) * 0.4;
  const regionJy = Math.sin(0.93 * 2.1 + tSec * 1.1) * 0.3;
  const labelJx = Math.cos(1.24 * 1.7 + tSec * 1.3) * 0.4;
  const labelJy = Math.sin(1.24 * 2.1 + tSec * 1.1) * 0.3;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0 }}
    >
      <defs>
        <filter id="rationalGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Undefined region highlight - behind everything */}
      {highlight_undefined_regions ? (
        <rect
          x={asymptoteX - 40 + regionJx}
          y={height * 0.15 + regionJy}
          width={80}
          height={height * 0.7}
          fill="oklch(0.72 0.16 80)"
          fillOpacity={0.2 * regionShimmer * regionOpacity}
        />
      ) : null}

      {/* Coordinate axes */}
      <g filter="url(#rationalGlow)" transform={`translate(${axesJx}, ${axesJy})`}>
        {/* X-axis */}
        <line
          x1={width * 0.05}
          y1={height * 0.6}
          x2={width * 0.95}
          y2={height * 0.6}
          stroke="white"
          strokeWidth={1.5}
          opacity={0.6 * axesShimmer}
        />
        {/* Y-axis */}
        <line
          x1={width * 0.5}
          y1={height * 0.1}
          x2={width * 0.5}
          y2={height * 0.9}
          stroke="white"
          strokeWidth={1.5}
          opacity={0.6 * axesShimmer}
        />
      </g>

      {/* Vertical asymptote */}
      {show_asymptotes ? (
        <line
          x1={asymptoteX + asymptoteJx}
          y1={height * 0.1}
          x2={asymptoteX + asymptoteJx}
          y2={height * 0.9}
          stroke="oklch(0.72 0.16 80)"
          strokeWidth={1.5}
          strokeDasharray="8,4"
          opacity={asymptoteShimmer * asymptoteOpacity}
        />
      ) : null}

      {/* Rational function curve */}
      <g filter="url(#rationalGlow)" transform={`translate(${curveJx}, ${curveJy})`}>
        {/* Left branch */}
        <path
          d={leftPath}
          fill="none"
          stroke="white"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={curveShimmer}
          strokeDasharray={leftCurveProgress < 1 ? `${leftCurveProgress * 500} 500` : "none"}
        />
        
        {/* Right branch */}
        <path
          d={rightPath}
          fill="none"
          stroke="white"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={curveShimmer}
          strokeDasharray={rightCurveProgress < 1 ? `${rightCurveProgress * 500} 500` : "none"}
        />
      </g>

      {/* Peak marker */}
      {show_peak_marker ? (
        <circle
          cx={asymptoteX - 140 + curveJx}
          cy={height * 0.25 + curveJy}
          r={6 * peakPulse}
          fill="oklch(0.72 0.16 80)"
          opacity={featuresOpacity * curveShimmer}
        />
      ) : null}

      {/* Axis labels */}
      <g transform={`translate(${labelJx}, ${labelJy})`}>
        <text
          x={width * 0.92}
          y={height * 0.58}
          fill="white"
          fontSize={22}
          fontFamily="ui-monospace, monospace"
          textAnchor="end"
          opacity={0.8 * labelShimmer}
        >
          x
        </text>
        <text
          x={width * 0.52}
          y={height * 0.15}
          fill="white"
          fontSize={22}
          fontFamily="ui-monospace, monospace"
          opacity={0.8 * labelShimmer}
        >
          y
        </text>
      </g>

      {/* Function label */}
      <text
        x={width * 0.1 + labelJx}
        y={height * 0.3 + labelJy}
        fill="white"
        fontSize={18}
        fontFamily="ui-monospace, monospace"
        opacity={0.8 * featuresOpacity * labelShimmer}
      >
        f(x) = P(x)/Q(x)
      </text>
    </svg>
  );
}