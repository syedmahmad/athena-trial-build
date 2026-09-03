import { useCurrentFrame, useVideoConfig } from "remotion";
import { drawProgress, fadeOpacity } from "../utils/timing";

/**
 * Medical test result visualization with positive/negative indicator and
 * optional uncertainty visualization. Shows a clean test strip or readout
 * with animated reveal and uncertainty indicators.
 */
export function MedicalTestVisual({
  test_result,
  show_uncertainty = false,
  animation = "test_reveal",
  beatDurationFrames: _beatDurationFrames,
}: {
  test_result: "positive" | "negative";
  show_uncertainty?: boolean;
  animation?: "test_reveal" | "static" | "pulse";
  beatDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const tSec = frame / fps;

  const isPositive = test_result === "positive";
  const centerX = width / 2;
  const centerY = height / 2;

  // Test strip dimensions
  const stripWidth = 240;
  const stripHeight = 80;
  const stripX = centerX - stripWidth / 2;
  const stripY = centerY - stripHeight / 2;

  // Test window dimensions (where result appears)
  const windowWidth = 60;
  const windowHeight = 50;
  const windowX = stripX + stripWidth - windowWidth - 20;
  const windowY = stripY + (stripHeight - windowHeight) / 2;

  // Control line (always present)
  const controlX = stripX + 40;
  const controlY = stripY + stripHeight / 2;

  // Animation timings
  const STRIP_APPEAR = 0;
  const CONTROL_LINE_START = 200;
  const RESULT_LINE_START = 600;
  const RESULT_FADE_START = 1000;
  const UNCERTAINTY_START = 1200;
  const LABEL_START = 800;

  // Static mode overrides
  const isStatic = animation === "static";
  const stripOpacity = isStatic ? 1 : fadeOpacity({
    framesSinceBeatStart: frame,
    fps,
    appear_s: STRIP_APPEAR / 1000,
    fadeMs: 350,
  });

  const controlProgress = isStatic ? 1 : drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: CONTROL_LINE_START,
    durationMs: 400,
  });

  const resultProgress = isStatic ? 1 : drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: RESULT_LINE_START,
    durationMs: 450,
  });

  const resultOpacity = isStatic ? 1 : fadeOpacity({
    framesSinceBeatStart: frame,
    fps,
    appear_s: RESULT_FADE_START / 1000,
    fadeMs: 300,
  });

  const uncertaintyOpacity = (isStatic || !show_uncertainty) ? 
    (show_uncertainty ? 1 : 0) : 
    fadeOpacity({
      framesSinceBeatStart: frame,
      fps,
      appear_s: UNCERTAINTY_START / 1000,
      fadeMs: 400,
    });

  const labelOpacity = isStatic ? 1 : fadeOpacity({
    framesSinceBeatStart: frame,
    fps,
    appear_s: LABEL_START / 1000,
    fadeMs: 350,
  });

  // Living treatment - shimmer and jitter
  const shimmer = 0.85 + 0.15 * Math.sin(tSec * 1.8);
  const jitterX = Math.cos(tSec * 1.3) * 0.3;
  const jitterY = Math.sin(tSec * 1.1) * 0.3;

  // Pulse effect for pulse animation
  const pulseScale = animation === "pulse" ? 
    1 + 0.03 * Math.sin(tSec * 2.2) : 1;
  const pulseBrightness = animation === "pulse" ?
    0.9 + 0.1 * (1 + Math.sin(tSec * 2.2)) * 0.5 : 1;

  // Uncertainty bars positioning
  const uncertaintyBars = show_uncertainty ? [
    { x: centerX - 100, width: 80, confidence: 0.75 },
    { x: centerX - 10, width: 60, confidence: 0.85 },
    { x: centerX + 60, width: 90, confidence: 0.65 },
  ] : [];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0 }}
    >
      <defs>
        <filter id="testGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Main group with pulse scaling */}
      <g transform={`translate(${centerX} ${centerY}) scale(${pulseScale}) translate(${-centerX} ${-centerY})`}>
        
        {/* Test strip body */}
        <rect
          x={stripX + jitterX}
          y={stripY + jitterY}
          width={stripWidth}
          height={stripHeight}
          fill="none"
          stroke="white"
          strokeWidth={2}
          rx={8}
          opacity={stripOpacity * shimmer * pulseBrightness}
        />

        {/* Test window outline */}
        <rect
          x={windowX + jitterX}
          y={windowY + jitterY}
          width={windowWidth}
          height={windowHeight}
          fill="none"
          stroke="white"
          strokeWidth={1.5}
          rx={4}
          opacity={stripOpacity * 0.6 * pulseBrightness}
        />

        {/* Control line (always present) */}
        <rect
          x={controlX + jitterX}
          y={controlY - 2 + jitterY}
          width={20 * controlProgress}
          height={4}
          fill="white"
          opacity={0.9 * pulseBrightness}
          filter="url(#testGlow)"
        />

        {/* Test result line (positive only) */}
        {isPositive ? (
          <rect
            x={windowX + 15 + jitterX}
            y={windowY + 15 + jitterY}
            width={30 * resultProgress}
            height={4}
            fill={`oklch(0.72 0.16 80)`}
            opacity={resultOpacity * pulseBrightness}
            filter="url(#testGlow)"
          />
        ) : null}

        {/* Result labels */}
        <g opacity={labelOpacity * pulseBrightness}>
          <text
            x={centerX + jitterX}
            y={stripY - 30 + jitterY}
            fill="white"
            fontSize={32}
            fontFamily="ui-monospace, monospace"
            textAnchor="middle"
            opacity={shimmer}
          >
            {test_result.toUpperCase()}
          </text>
          
          <text
            x={centerX + jitterX}
            y={stripY + stripHeight + 50 + jitterY}
            fill="white"
            fontSize={18}
            fontFamily="ui-monospace, monospace"
            textAnchor="middle"
            opacity={0.7 * shimmer}
          >
            Test Result
          </text>
        </g>

        {/* Uncertainty indicators */}
        {show_uncertainty ? (
          <g opacity={uncertaintyOpacity}>
            <text
              x={centerX + jitterX}
              y={stripY + stripHeight + 90 + jitterY}
              fill="white"
              fontSize={16}
              fontFamily="ui-monospace, monospace"
              textAnchor="middle"
              opacity={0.6}
            >
              Confidence Intervals
            </text>
            
            {uncertaintyBars.map((bar, i) => {
              const barShimmer = 0.7 + 0.2 * Math.sin(tSec * 1.5 + i * 0.4);
              const barJitterX = Math.cos(i * 2.1 + tSec * 1.2) * 0.2;
              return (
                <g key={i}>
                  {/* Confidence bar */}
                  <rect
                    x={bar.x + barJitterX + jitterX}
                    y={stripY + stripHeight + 110 + i * 25 + jitterY}
                    width={bar.width * bar.confidence}
                    height={8}
                    fill="white"
                    opacity={barShimmer * 0.4}
                  />
                  
                  {/* Confidence percentage */}
                  <text
                    x={bar.x + bar.width + 10 + barJitterX + jitterX}
                    y={stripY + stripHeight + 118 + i * 25 + jitterY}
                    fill="white"
                    fontSize={12}
                    fontFamily="ui-monospace, monospace"
                    opacity={barShimmer * 0.6}
                  >
                    {Math.round(bar.confidence * 100)}%
                  </text>
                </g>
              );
            })}
          </g>
        ) : null}

        {/* Control line label */}
        <text
          x={controlX - 10 + jitterX}
          y={controlY + 20 + jitterY}
          fill="white"
          fontSize={12}
          fontFamily="ui-monospace, monospace"
          textAnchor="middle"
          opacity={labelOpacity * 0.6 * pulseBrightness}
        >
          C
        </text>

        {/* Test line label (positive only) */}
        {isPositive ? (
          <text
            x={windowX + 30 + jitterX}
            y={windowY - 8 + jitterY}
            fill={`oklch(0.72 0.16 80)`}
            fontSize={12}
            fontFamily="ui-monospace, monospace"
            textAnchor="middle"
            opacity={resultOpacity * pulseBrightness}
          >
            T
          </text>
        ) : null}
      </g>
    </svg>
  );
}