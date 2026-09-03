import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { fadeOpacity } from "../utils/timing";

/**
 * Shows a linear equation and animates through the algebraic steps to solve for x,
 * with each step appearing sequentially and the final answer highlighted.
 * 
 * Animation:
 *   - Initial equation appears first
 *   - Each step fades in sequentially based on step_duration_ms
 *   - Previous steps fade to reduced opacity when new step appears
 *   - Final solution gets highlighted if highlight_solution is true
 *   - Living treatment: shimmer on all text, subtle jitter, breathing brightness
 */
// The brief generator's LLM doesn't have access to this primitive's real
// prop schema (AI-authored primitives appear in the system prompt only by
// name + a generic placeholder doc). It hallucinates a different shape on
// most runs. Accept the common variants we've seen:
//   shape A: { equation: string, steps: string[] }
//   shape B: { initial_equation: string, steps: {equation, operation?}[] }
// Both should produce the same rendered sequence.
type StepShape = string | { equation?: string; operation?: string };
export function EquationSolver({
  equation,
  initial_equation,
  steps,
  highlight_solution = true,
  step_duration_ms = 1500,
  beatDurationFrames: _beatDurationFrames,
}: {
  equation?: string;
  initial_equation?: string;
  steps?: StepShape[];
  highlight_solution?: boolean;
  step_duration_ms?: number;
  beatDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const tSec = frame / fps;

  // Normalize starting equation across naming variants.
  const startingEq = (equation ?? initial_equation ?? "").trim();

  // Coerce steps to string[] regardless of whether the brief passed strings
  // or {equation, operation} objects.
  const stepStrs: string[] = (steps ?? [])
    .map((s) =>
      typeof s === "string" ? s : (s?.equation ?? "").toString()
    )
    .filter((s) => s.length > 0);

  // All text elements to show: starting equation + steps.
  // Dedupe: brief generators frequently emit the starting equation as BOTH
  // `equation`/`initial_equation` AND as `steps[0]`. Render it once.
  const stripWS = (s: string) => s.replace(/\s+/g, "");
  const allTexts =
    stepStrs.length > 0 && stripWS(stepStrs[0]) === stripWS(startingEq)
      ? stepStrs
      : [startingEq, ...stepStrs];

  // Layout - center the equations vertically with spacing
  const centerY = height * 0.5;
  const lineHeight = 80;
  const startY = centerY - ((allTexts.length - 1) * lineHeight) / 2;

  // Timing for each step
  const stepDurationSec = step_duration_ms / 1000;
  const fadeInDuration = 400; // ms for fade in
  const fadeOutDuration = 300; // ms for previous steps to fade

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0 }}
      fill="transparent"
    >
      <defs>
        <filter id="equationGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="solutionGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {allTexts.map((text, textIndex) => {
        const stepStartTime = textIndex * stepDurationSec;
        const stepEndTime = stepStartTime + fadeInDuration / 1000;
        const nextStepStartTime = (textIndex + 1) * stepDurationSec;
        
        // Determine opacity based on current time
        let opacity = 0;
        const isFinalStep = textIndex === allTexts.length - 1;
        
        if (tSec < stepStartTime) {
          // Before this step appears
          opacity = 0;
        } else if (tSec < stepEndTime) {
          // Fading in
          opacity = interpolate(
            tSec,
            [stepStartTime, stepEndTime],
            [0, 1],
            {
              easing: Easing.out(Easing.cubic),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }
          );
        } else if (isFinalStep || tSec < nextStepStartTime) {
          // Fully visible (either final step or before next step starts)
          opacity = 1;
        } else {
          // Previous step fading to background opacity
          const fadeStartTime = nextStepStartTime;
          const fadeEndTime = fadeStartTime + fadeOutDuration / 1000;
          if (tSec < fadeEndTime) {
            opacity = interpolate(
              tSec,
              [fadeStartTime, fadeEndTime],
              [1, 0.3],
              {
                easing: Easing.in(Easing.cubic),
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }
            );
          } else {
            opacity = 0.3;
          }
        }

        // Living treatment: shimmer, jitter, breath
        const shimmer = 0.85 + 0.15 * Math.sin(tSec * 1.8 + textIndex * 0.31);
        const jitterX = Math.cos(textIndex * 1.7 + tSec * 1.3) * 0.4;
        const jitterY = Math.sin(textIndex * 2.1 + tSec * 1.1) * 0.3;
        const breath = 0.88 + 0.12 * Math.sin(tSec * 0.9 - textIndex * 0.18);
        
        const finalOpacity = opacity * shimmer * breath;
        const y = startY + textIndex * lineHeight;

        // Highlight final solution
        const isHighlighted = highlight_solution && isFinalStep && opacity > 0.8;
        const fontSize = isHighlighted ? 52 : 44;
        const filter = isHighlighted ? "url(#solutionGlow)" : "url(#equationGlow)";
        const fill = isHighlighted ? "oklch(0.72 0.16 80)" : "white";

        // Scale effect for highlighted solution
        const highlightScale = isHighlighted 
          ? 1 + 0.05 * Math.sin(tSec * 2.2) 
          : 1;

        return (
          <text
            key={textIndex}
            x={width / 2 + jitterX}
            y={y + jitterY}
            fill={fill}
            fontSize={fontSize}
            fontFamily="ui-monospace, monospace"
            textAnchor="middle"
            opacity={finalOpacity}
            filter={filter}
            transform={`translate(${width / 2 + jitterX} ${y + jitterY}) scale(${highlightScale}) translate(${-(width / 2 + jitterX)} ${-(y + jitterY)})`}
          >
            {text}
          </text>
        );
      })}

      {/* Connecting arrows between steps (subtle) */}
      {allTexts.length > 1 && allTexts.map((_, textIndex) => {
        if (textIndex === allTexts.length - 1) return null;
        
        const currentStepTime = textIndex * stepDurationSec + fadeInDuration / 1000;
        const nextStepTime = (textIndex + 1) * stepDurationSec;
        
        const arrowOpacity = fadeOpacity({
          framesSinceBeatStart: frame,
          fps,
          appear_s: currentStepTime + 0.2,
          disappear_s: nextStepTime + 0.3,
          fadeMs: 250,
        });

        const arrowY = startY + textIndex * lineHeight + lineHeight / 2;
        const shimmer = 0.7 + 0.3 * Math.sin(tSec * 1.5 + textIndex * 0.4);
        
        return (
          <g key={`arrow-${textIndex}`} opacity={arrowOpacity * shimmer}>
            <line
              x1={width / 2}
              y1={arrowY - 8}
              x2={width / 2}
              y2={arrowY + 8}
              stroke="white"
              strokeWidth={1.5}
              strokeOpacity={0.5}
            />
            <polygon
              points={`${width / 2 - 4},${arrowY + 4} ${width / 2 + 4},${arrowY + 4} ${width / 2},${arrowY + 12}`}
              fill="white"
              fillOpacity={0.5}
            />
          </g>
        );
      })}
    </svg>
  );
}