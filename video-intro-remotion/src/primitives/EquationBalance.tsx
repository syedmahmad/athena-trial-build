import { useCurrentFrame, useVideoConfig } from "remotion";
import { drawProgress, fadeOpacity } from "../utils/timing";

/**
 * Shows an equation with balance scale metaphor overlay. Emphasizes the 'both sides' rule of equation solving.
 * 
 * Animation:
 *   - Equation text fades in (400ms).
 *   - Balance scale draws in pieces: base → fulcrum → left arm → right arm (800ms total).
 *   - Scale pans animate to show balance/imbalance based on equation sides.
 *   - Both sides highlight with pulsing amber glow when enabled.
 *   - Living treatment: shimmer on all elements, subtle jitter on scale components.
 */
export function EquationBalance({
  equation,
  show_balance_metaphor = false,
  highlight_both_sides = false,
  beatDurationFrames: _beatDurationFrames,
}: {
  equation: string;
  show_balance_metaphor?: boolean;
  highlight_both_sides?: boolean;
  beatDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const tSec = frame / fps;

  // Parse equation to find the equals sign and split into left/right sides
  const equalsIndex = equation.indexOf('=');
  const leftSide = equalsIndex >= 0 ? equation.substring(0, equalsIndex).trim() : equation;
  const rightSide = equalsIndex >= 0 ? equation.substring(equalsIndex + 1).trim() : '';
  const hasEqualsSign = equalsIndex >= 0;

  // Layout
  const centerX = width / 2;
  const equationY = height * 0.35;
  const scaleY = height * 0.65;

  // Timing
  const EQUATION_FADE_START = 0;
  const EQUATION_FADE_DUR = 400;
  const SCALE_BASE_START = 500;
  const SCALE_BASE_DUR = 200;
  const SCALE_FULCRUM_START = 700;
  const SCALE_FULCRUM_DUR = 200;
  const SCALE_ARMS_START = 900;
  const SCALE_ARMS_DUR = 400;
  const SCALE_PANS_START = 1300;
  const SCALE_PANS_DUR = 300;

  const equationOpacity = fadeOpacity({
    framesSinceBeatStart: frame,
    fps,
    appear_s: EQUATION_FADE_START / 1000,
    fadeMs: EQUATION_FADE_DUR,
  });

  const scaleBaseProgress = drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: SCALE_BASE_START,
    durationMs: SCALE_BASE_DUR,
  });

  const scaleFulcrumProgress = drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: SCALE_FULCRUM_START,
    durationMs: SCALE_FULCRUM_DUR,
  });

  const scaleArmsProgress = drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: SCALE_ARMS_START,
    durationMs: SCALE_ARMS_DUR,
  });

  const scalePansProgress = drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: SCALE_PANS_START,
    durationMs: SCALE_PANS_DUR,
  });

  // Living treatment effects
  const shimmerPhase = tSec * 1.8;
  const equationShimmer = 0.9 + 0.1 * Math.sin(shimmerPhase);
  const equalsShimmer = 0.85 + 0.15 * Math.sin(shimmerPhase + 0.5);
  
  const scaleJitterX = Math.cos(tSec * 1.3) * 0.3;
  const scaleJitterY = Math.sin(tSec * 1.1 + 0.4) * 0.2;

  // Highlight both sides effect
  const highlightOpacity = highlight_both_sides 
    ? (0.3 + 0.2 * Math.sin(tSec * 2.1)) 
    : 0;

  // Scale balance animation - subtle tilt based on visual "weight" of sides
  const leftWeight = leftSide.length;
  const rightWeight = rightSide.length;
  const balanceTilt = leftWeight === rightWeight ? 0 : 
    Math.sign(rightWeight - leftWeight) * Math.min(8, Math.abs(rightWeight - leftWeight) * 0.8);
  const currentTilt = balanceTilt * scalePansProgress;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0 }}
    >
      <defs>
        <filter id="equationGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="scaleGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Equation text */}
      <g opacity={equationOpacity} filter="url(#equationGlow)">
        {/* Left side with highlight */}
        {highlight_both_sides && (
          <rect
            x={centerX - 200}
            y={equationY - 35}
            width={leftSide.length * 15 + 20}
            height={50}
            fill="oklch(0.72 0.16 80)"
            fillOpacity={highlightOpacity}
            rx={8}
          />
        )}
        <text
          x={centerX - 40}
          y={equationY}
          fill="white"
          fontSize={48}
          fontFamily="ui-monospace, monospace"
          textAnchor="end"
          opacity={equationShimmer}
        >
          {leftSide}
        </text>

        {/* Equals sign */}
        {hasEqualsSign && (
          <text
            x={centerX}
            y={equationY}
            fill="white"
            fontSize={48}
            fontFamily="ui-monospace, monospace"
            textAnchor="middle"
            opacity={equalsShimmer}
          >
            =
          </text>
        )}

        {/* Right side with highlight */}
        {hasEqualsSign && (
          <>
            {highlight_both_sides && (
              <rect
                x={centerX + 40}
                y={equationY - 35}
                width={rightSide.length * 15 + 20}
                height={50}
                fill="oklch(0.72 0.16 80)"
                fillOpacity={highlightOpacity}
                rx={8}
              />
            )}
            <text
              x={centerX + 40}
              y={equationY}
              fill="white"
              fontSize={48}
              fontFamily="ui-monospace, monospace"
              textAnchor="start"
              opacity={equationShimmer * 0.95}
            >
              {rightSide}
            </text>
          </>
        )}
      </g>

      {/* Balance scale metaphor */}
      {show_balance_metaphor && (
        <g 
          filter="url(#scaleGlow)"
          transform={`translate(${scaleJitterX}, ${scaleJitterY})`}
        >
          {/* Base */}
          <rect
            x={centerX - 60}
            y={scaleY + 60}
            width={120 * scaleBaseProgress}
            height={8}
            fill="white"
            opacity={0.8}
            rx={4}
          />

          {/* Fulcrum */}
          <polygon
            points={`${centerX},${scaleY + 60} ${centerX - 20 * scaleFulcrumProgress},${scaleY + 20} ${centerX + 20 * scaleFulcrumProgress},${scaleY + 20}`}
            fill="white"
            opacity={0.8}
          />

          {/* Left arm */}
          <g transform={`rotate(${-currentTilt} ${centerX} ${scaleY + 20})`}>
            <line
              x1={centerX}
              y1={scaleY + 20}
              x2={centerX - 150 * scaleArmsProgress}
              y2={scaleY + 20}
              stroke="white"
              strokeWidth={3}
              opacity={0.9}
            />
            
            {/* Left pan */}
            {scalePansProgress > 0 && (
              <g opacity={scalePansProgress}>
                <line
                  x1={centerX - 150}
                  y1={scaleY + 20}
                  x2={centerX - 150}
                  y2={scaleY + 35}
                  stroke="white"
                  strokeWidth={2}
                />
                <ellipse
                  cx={centerX - 150}
                  cy={scaleY + 40}
                  rx={40}
                  ry={8}
                  fill="none"
                  stroke="white"
                  strokeWidth={2}
                  opacity={0.7}
                />
              </g>
            )}
          </g>

          {/* Right arm */}
          <g transform={`rotate(${-currentTilt} ${centerX} ${scaleY + 20})`}>
            <line
              x1={centerX}
              y1={scaleY + 20}
              x2={centerX + 150 * scaleArmsProgress}
              y2={scaleY + 20}
              stroke="white"
              strokeWidth={3}
              opacity={0.9}
            />
            
            {/* Right pan */}
            {scalePansProgress > 0 && (
              <g opacity={scalePansProgress}>
                <line
                  x1={centerX + 150}
                  y1={scaleY + 20}
                  x2={centerX + 150}
                  y2={scaleY + 35}
                  stroke="white"
                  strokeWidth={2}
                />
                <ellipse
                  cx={centerX + 150}
                  cy={scaleY + 40}
                  rx={40}
                  ry={8}
                  fill="none"
                  stroke="white"
                  strokeWidth={2}
                  opacity={0.7}
                />
              </g>
            )}
          </g>

          {/* Scale post shimmer */}
          <circle
            cx={centerX}
            cy={scaleY + 20}
            r={4}
            fill="white"
            opacity={0.85 + 0.15 * Math.sin(shimmerPhase + 1.2)}
          />
        </g>
      )}

      {/* Subtle connection lines between equation sides and scale pans (when both enabled) */}
      {show_balance_metaphor && highlight_both_sides && scalePansProgress > 0.5 && (
        <g opacity={0.3}>
          <line
            x1={centerX - 100}
            y1={equationY + 20}
            x2={centerX - 150 + scaleJitterX}
            y2={scaleY + 30 + scaleJitterY}
            stroke="oklch(0.72 0.16 80)"
            strokeWidth={1}
            strokeDasharray="4,4"
            opacity={0.6}
          />
          <line
            x1={centerX + 100}
            y1={equationY + 20}
            x2={centerX + 150 + scaleJitterX}
            y2={scaleY + 30 + scaleJitterY}
            stroke="oklch(0.72 0.16 80)"
            strokeWidth={1}
            strokeDasharray="4,4"
            opacity={0.6}
          />
        </g>
      )}
    </svg>
  );
}