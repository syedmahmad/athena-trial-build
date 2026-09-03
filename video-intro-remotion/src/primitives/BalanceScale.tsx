import { useCurrentFrame, useVideoConfig } from "remotion";
import { drawProgress, fadeOpacity } from "../utils/timing";

/**
 * Wireframe balance scale with weights on each side. Shows the concept
 * of equilibrium and can animate tilting or balancing. The scale fulcrum
 * appears first, followed by the beam drawing outward from center, then
 * weight containers drop down with their contents filling based on the
 * weight values.
 *
 * Animation:
 *   - Fulcrum draws up from base (350ms)
 *   - Beam draws outward from center (400ms, starts 200ms after fulcrum)
 *   - Weight containers drop down (300ms each, staggered 100ms)
 *   - Weights fill containers (500ms each, after containers settle)
 *   - Scale tilts based on weight difference and animation mode
 *   - Living treatment: shimmer on all elements, gentle sway even when static
 */
export function BalanceScale({
  left_weight,
  right_weight,
  show_equilibrium,
  animation,
  beatDurationFrames: _beatDurationFrames,
}: {
  left_weight: number;
  right_weight: number;
  show_equilibrium: boolean;
  animation: "gentle_sway" | "tilt_left" | "tilt_right" | "static";
  beatDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const tSec = frame / fps;

  // Layout constants
  const centerX = width * 0.5;
  const baseY = height * 0.75;
  const fulcrumHeight = height * 0.15;
  const fulcrumTop = baseY - fulcrumHeight;
  const beamLength = width * 0.6;
  const beamY = fulcrumTop - 20;
  const leftPanX = centerX - beamLength * 0.4;
  const rightPanX = centerX + beamLength * 0.4;
  const panWidth = width * 0.12;
  const panHeight = height * 0.08;
  const chainLength = height * 0.06;

  // Animation timing
  const FULCRUM_START = 100;
  const FULCRUM_DUR = 350;
  const BEAM_START = 300;
  const BEAM_DUR = 400;
  const LEFT_CONTAINER_START = 750;
  const RIGHT_CONTAINER_START = 850;
  const CONTAINER_DUR = 300;
  const LEFT_FILL_START = LEFT_CONTAINER_START + CONTAINER_DUR + 100;
  const RIGHT_FILL_START = RIGHT_CONTAINER_START + CONTAINER_DUR + 100;
  const FILL_DUR = 500;

  // Draw progress for each element
  const fulcrumProgress = drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: FULCRUM_START,
    durationMs: FULCRUM_DUR,
  });

  const beamProgress = drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: BEAM_START,
    durationMs: BEAM_DUR,
  });

  const leftContainerProgress = drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: LEFT_CONTAINER_START,
    durationMs: CONTAINER_DUR,
  });

  const rightContainerProgress = drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: RIGHT_CONTAINER_START,
    durationMs: CONTAINER_DUR,
  });

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

  // Calculate tilt angle based on weights and animation mode
  const maxWeight = Math.max(left_weight, right_weight, 1);
  const leftNorm = left_weight / maxWeight;
  const rightNorm = right_weight / maxWeight;
  
  let tiltAngle = 0;
  if (!show_equilibrium) {
    const weightDiff = (rightNorm - leftNorm) * 0.15; // Max 15 degree tilt
    
    switch (animation) {
      case "tilt_left":
        tiltAngle = -Math.abs(weightDiff) - 0.08;
        break;
      case "tilt_right":
        tiltAngle = Math.abs(weightDiff) + 0.08;
        break;
      case "gentle_sway":
        tiltAngle = weightDiff + 0.03 * Math.sin(tSec * 1.2);
        break;
      case "static":
        tiltAngle = weightDiff;
        break;
    }
  } else {
    // Equilibrium with gentle sway
    tiltAngle = animation === "gentle_sway" ? 0.02 * Math.sin(tSec * 0.8) : 0;
  }

  // Living treatment - shimmer and jitter
  const fulcrumShimmer = 0.85 + 0.15 * Math.sin(tSec * 1.8 + 0.1);
  const beamShimmer = 0.85 + 0.15 * Math.sin(tSec * 1.8 + 0.3);
  const leftPanShimmer = 0.85 + 0.15 * Math.sin(tSec * 1.8 + 0.5);
  const rightPanShimmer = 0.85 + 0.15 * Math.sin(tSec * 1.8 + 0.7);
  
  const beamJitterX = Math.cos(tSec * 1.3 + 0.2) * 0.3;
  const beamJitterY = Math.sin(tSec * 1.1 + 0.4) * 0.2;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0 }}
    >
      <defs>
        <filter id="balanceGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Fulcrum base (triangle) */}
      <g opacity={fulcrumShimmer}>
        <path
          d={`M ${centerX - 30} ${baseY} L ${centerX + 30} ${baseY} L ${centerX} ${baseY - fulcrumHeight * fulcrumProgress} Z`}
          fill="none"
          stroke="white"
          strokeWidth={2.5}
          strokeLinejoin="round"
          filter="url(#balanceGlow)"
        />
      </g>

      {/* Beam (horizontal bar with tilt) */}
      <g 
        transform={`translate(${centerX + beamJitterX} ${beamY + beamJitterY}) rotate(${tiltAngle * (180 / Math.PI)}) translate(${-centerX} ${-beamY})`}
        opacity={beamShimmer}
      >
        <line
          x1={centerX - beamLength * 0.5 * beamProgress}
          y1={beamY}
          x2={centerX + beamLength * 0.5 * beamProgress}
          y2={beamY}
          stroke="white"
          strokeWidth={3}
          strokeLinecap="round"
          filter="url(#balanceGlow)"
        />
        
        {/* Fulcrum pivot point */}
        <circle
          cx={centerX}
          cy={beamY}
          r={6}
          fill="white"
          opacity={beamProgress}
        />

        {/* Chain connections */}
        {beamProgress > 0.8 && (
          <>
            <line
              x1={leftPanX}
              y1={beamY}
              x2={leftPanX}
              y2={beamY + chainLength * leftContainerProgress}
              stroke="white"
              strokeWidth={1.5}
              opacity={leftContainerProgress}
            />
            <line
              x1={rightPanX}
              y1={beamY}
              x2={rightPanX}
              y2={beamY + chainLength * rightContainerProgress}
              stroke="white"
              strokeWidth={1.5}
              opacity={rightContainerProgress}
            />
          </>
        )}

        {/* Left weight pan */}
        {leftContainerProgress > 0 && (
          <g opacity={leftPanShimmer}>
            <rect
              x={leftPanX - panWidth * 0.5}
              y={beamY + chainLength * leftContainerProgress}
              width={panWidth}
              height={panHeight}
              fill="none"
              stroke="white"
              strokeWidth={2}
              rx={4}
              filter="url(#balanceGlow)"
            />
            {/* Weight fill */}
            <rect
              x={leftPanX - panWidth * 0.5}
              y={beamY + chainLength * leftContainerProgress + panHeight * (1 - leftNorm * leftFillProgress)}
              width={panWidth}
              height={panHeight * leftNorm * leftFillProgress}
              fill="white"
              opacity={0.7}
            />
            {/* Weight value label */}
            {leftFillProgress > 0.5 && (
              <text
                x={leftPanX}
                y={beamY + chainLength + panHeight + 25}
                fill="white"
                fontSize={16}
                fontFamily="ui-monospace, monospace"
                textAnchor="middle"
                opacity={0.8}
              >
                {left_weight}
              </text>
            )}
          </g>
        )}

        {/* Right weight pan */}
        {rightContainerProgress > 0 && (
          <g opacity={rightPanShimmer}>
            <rect
              x={rightPanX - panWidth * 0.5}
              y={beamY + chainLength * rightContainerProgress}
              width={panWidth}
              height={panHeight}
              fill="none"
              stroke="white"
              strokeWidth={2}
              rx={4}
              filter="url(#balanceGlow)"
            />
            {/* Weight fill */}
            <rect
              x={rightPanX - panWidth * 0.5}
              y={beamY + chainLength * rightContainerProgress + panHeight * (1 - rightNorm * rightFillProgress)}
              width={panWidth}
              height={panHeight * rightNorm * rightFillProgress}
              fill="white"
              opacity={0.7}
            />
            {/* Weight value label */}
            {rightFillProgress > 0.5 && (
              <text
                x={rightPanX}
                y={beamY + chainLength + panHeight + 25}
                fill="white"
                fontSize={16}
                fontFamily="ui-monospace, monospace"
                textAnchor="middle"
                opacity={0.8}
              >
                {right_weight}
              </text>
            )}
          </g>
        )}
      </g>

      {/* Equilibrium indicator */}
      {show_equilibrium && leftFillProgress > 0.8 && rightFillProgress > 0.8 && (
        <text
          x={centerX}
          y={height * 0.9}
          fill="oklch(0.72 0.16 80)"
          fontSize={20}
          fontFamily="ui-monospace, monospace"
          textAnchor="middle"
          opacity={fadeOpacity({
            framesSinceBeatStart: frame,
            fps,
            appear_s: (Math.max(LEFT_FILL_START, RIGHT_FILL_START) + FILL_DUR + 200) / 1000,
            fadeMs: 400,
          })}
        >
          BALANCED
        </text>
      )}
    </svg>
  );
}