import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { fadeOpacity } from "../utils/timing";
import { WireframeTerrainBackground } from "./WireframeTerrainBackground";

/**
 * Animated sequence of coin flips. Each outcome plays as a scaleX
 * flip (1 → 0 → 1 over flip_duration_ms), settling on the named
 * face (H or T) for landing_dwell_ms before the next flip. A running
 * tally of outcomes accumulates below the coin.
 *
 * Probability label (e.g. "P(H) = 4/7") appears once all outcomes have
 * been flipped, if `show_probability` is true.
 *
 * Designed for probability / sample-space beats — visually sells the
 * randomness without leaning on a real video model.
 */
export function CoinFlip({
  outcomes = ["H", "T"],
  show_probability = true,
  flip_duration_ms = 600,
  landing_dwell_ms = 500,
  overlay_on = "blank",
  beatDurationFrames: _beatDurationFrames,
}: {
  outcomes?: Array<"H" | "T">;
  show_probability?: boolean;
  flip_duration_ms?: number;
  landing_dwell_ms?: number;
  overlay_on?: "wireframe_terrain" | "blank";
  beatDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const tSec = frame / fps;
  const showBackground = overlay_on === "wireframe_terrain";

  const safeOutcomes = outcomes.length > 0 ? outcomes : ["H"];
  const cyclePeriodMs = flip_duration_ms + landing_dwell_ms;
  const totalSequenceMs = cyclePeriodMs * safeOutcomes.length;

  // Coin geometry.
  const cx = width * 0.5;
  const cy = height * 0.4;
  const radius = 80;

  // Determine which outcome we're currently on and the phase within it.
  const elapsedMs = Math.max(0, tSec * 1000);
  const outcomeIndex = Math.min(
    safeOutcomes.length - 1,
    Math.floor(elapsedMs / cyclePeriodMs),
  );
  const phaseMs = elapsedMs - outcomeIndex * cyclePeriodMs;
  const inFlip = phaseMs < flip_duration_ms;
  const flipProgress = inFlip ? phaseMs / flip_duration_ms : 1;

  // Flip animation: scaleX oscillates with progressively decreasing
  // amplitude — | 1 → 0 → 1 → 0 → 1 | over the full duration so we
  // get a sense of momentum.
  // We use cos(progress * π * N) with envelope decay for visual interest.
  const flipScaleX = inFlip
    ? Math.cos(flipProgress * Math.PI * 3) * (1 - flipProgress * 0.4)
    : 1;
  // Slight bounce on landing.
  const settleProgress = !inFlip
    ? interpolate(
        phaseMs,
        [flip_duration_ms, flip_duration_ms + 120],
        [0, 1],
        {
          easing: Easing.out(Easing.cubic),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        },
      )
    : 0;
  const landingBob = inFlip
    ? 0
    : Math.sin(settleProgress * Math.PI) * 4;

  // Current face: show "?" mid-flip, otherwise the outcome.
  const currentFace = inFlip ? "?" : safeOutcomes[outcomeIndex];

  // Tally below: shows each outcome flipped so far.
  const tally = safeOutcomes.slice(0, outcomeIndex + (inFlip ? 0 : 1));
  const headCount = tally.filter((o) => o === "H").length;
  const tailCount = tally.filter((o) => o === "T").length;

  const probabilityOpacity = fadeOpacity({
    framesSinceBeatStart: frame,
    fps,
    appear_s: (totalSequenceMs + 200) / 1000,
    fadeMs: 420,
  });
  // Subtle breath on the settled coin between flips.
  const breath =
    inFlip ? 1 : 1 + 0.012 * Math.sin(tSec * 1.6);

  // Probability text.
  const probabilityText = (() => {
    if (!show_probability) return null;
    const total = safeOutcomes.length;
    return `P(H) = ${headCount}/${total},  P(T) = ${tailCount}/${total}`;
  })();

  return (
    <>
      {showBackground ? <WireframeTerrainBackground opacity={0.65} /> : null}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <filter id="coinGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Coin */}
        <g
          transform={`translate(${cx} ${cy - landingBob}) scale(${flipScaleX * breath} ${breath}) translate(${-cx} ${-cy})`}
        >
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="white"
            strokeWidth={2.4}
            filter="url(#coinGlow)"
            opacity={0.95}
          />
          {/* Inner ring to add depth */}
          <circle
            cx={cx}
            cy={cy}
            r={radius - 8}
            fill="none"
            stroke="white"
            strokeWidth={1.2}
            opacity={0.5}
          />
          <text
            x={cx}
            y={cy + 22}
            fill="white"
            fontSize={64}
            fontFamily="ui-monospace, monospace"
            textAnchor="middle"
            fontWeight="bold"
            opacity={inFlip ? 0.45 : 1}
          >
            {currentFace}
          </text>
        </g>

        {/* Outcome tally below — each cell shows a single outcome. */}
        <g transform={`translate(0 ${cy + radius + 70})`}>
          {safeOutcomes.map((outcome, i) => {
            const cellW = 44;
            const cellGap = 8;
            const totalW = safeOutcomes.length * cellW + (safeOutcomes.length - 1) * cellGap;
            const startX = (width - totalW) / 2;
            const ix = startX + i * (cellW + cellGap);
            const isRevealed = i < tally.length;
            return (
              <g
                key={i}
                opacity={isRevealed ? 1 : 0.25}
                transform={isRevealed ? `translate(0 0)` : `translate(0 0)`}
              >
                <rect
                  x={ix}
                  y={0}
                  width={cellW}
                  height={cellW}
                  fill="none"
                  stroke="white"
                  strokeWidth={1.4}
                  opacity={0.55}
                />
                {isRevealed ? (
                  <text
                    x={ix + cellW / 2}
                    y={cellW / 2 + 9}
                    fill="white"
                    fontSize={26}
                    fontFamily="ui-monospace, monospace"
                    textAnchor="middle"
                    fontWeight="bold"
                  >
                    {outcome}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>

        {/* Probability summary text */}
        {probabilityText ? (
          <text
            x={width / 2}
            y={cy + radius + 70 + 60 + 50}
            fill="white"
            fontSize={26}
            fontFamily="ui-monospace, monospace"
            textAnchor="middle"
            opacity={probabilityOpacity}
          >
            {probabilityText}
          </text>
        ) : null}
      </svg>
    </>
  );
}
