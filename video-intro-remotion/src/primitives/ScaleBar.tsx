import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { drawProgress, fadeOpacity } from "../utils/timing";
import { WireframeTerrainBackground } from "./WireframeTerrainBackground";

/**
 * Horizontal bar-chart magnitude comparison. Used for ratio, proportion,
 * and "X is N times Y" beats — anywhere a side-by-side numeric scale
 * makes the relationship obvious.
 *
 * Animation:
 *   - Bars grow from 0 to (value / max) * full-bar-width sequentially
 *     (left → right within each bar; top → bottom across bars).
 *   - Numeric labels count up alongside the fill (uses `interpolate` on
 *     the growth progress).
 *   - If `show_ratio: true`, the simplified ratio appears once all bars
 *     have settled.
 */
type ScaleBarSpec = {
  value: number;
  label: string;
  color?: string;
};

export function ScaleBar({
  bars,
  unit,
  show_ratio = false,
  overlay_on = "blank",
  beatDurationFrames: _beatDurationFrames,
}: {
  bars: ScaleBarSpec[];
  unit?: string;
  show_ratio?: boolean;
  overlay_on?: "wireframe_terrain" | "blank";
  beatDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const showBackground = overlay_on === "wireframe_terrain";

  // Guard against empty / degenerate input.
  const safeBars = bars.length > 0 ? bars : [{ value: 1, label: "" }];
  const maxValue = Math.max(...safeBars.map((b) => Math.abs(b.value)), 1e-9);

  // Layout: stacked horizontal bars.
  const valueColumnWidth = width * 0.12;
  const barAreaLeft = width * 0.22;
  const barAreaRight = width - valueColumnWidth - width * 0.06;
  const barFullWidth = barAreaRight - barAreaLeft;
  const barHeight = 44;
  const barGap = 22;
  const totalHeight = safeBars.length * barHeight + (safeBars.length - 1) * barGap;
  const startY = (height - totalHeight) / 2;

  const PER_BAR_START_MS = 220;
  const BAR_DUR_MS = 720;
  const RATIO_START_MS = PER_BAR_START_MS * safeBars.length + BAR_DUR_MS + 250;

  // Build the simplified ratio string for `show_ratio` mode. Only
  // makes sense for >= 2 bars with non-negative integer-friendly
  // values. Falls back to no-render if values aren't clean.
  const ratioText = (() => {
    if (!show_ratio || safeBars.length < 2) return null;
    const values = safeBars.map((b) => b.value);
    if (values.some((v) => v <= 0 || !Number.isFinite(v))) return null;
    // Round to nearest integer for ratio if values are close enough.
    const rounded = values.map((v) => Math.round(v));
    const allClose = values.every((v, i) => Math.abs(v - rounded[i]) < 1e-6);
    const ints = allClose ? rounded : values;
    // Simplify by GCD if all-int.
    if (allClose) {
      const g = ints.reduce((acc: number, n) => gcd(acc, Math.abs(n)), Math.abs(ints[0]));
      const safeG = g > 0 ? g : 1;
      return ints.map((n) => n / safeG).join(" : ");
    }
    return ints.map((n) => n.toFixed(2)).join(" : ");
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
          <filter id="sbGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {safeBars.map((bar, i) => {
          const startMs = PER_BAR_START_MS * (i + 1);
          const progress = drawProgress({
            framesSinceBeatStart: frame,
            fps,
            startMs,
            durationMs: BAR_DUR_MS,
          });
          const labelOpacity = fadeOpacity({
            framesSinceBeatStart: frame,
            fps,
            appear_s: (startMs - 120) / 1000,
            fadeMs: 320,
          });
          const valueOpacity = fadeOpacity({
            framesSinceBeatStart: frame,
            fps,
            appear_s: (startMs + 100) / 1000,
            fadeMs: 350,
          });

          const cy = startY + i * (barHeight + barGap) + barHeight / 2;
          const barTop = cy - barHeight / 2;
          const fillFraction = Math.abs(bar.value) / maxValue;
          const fillWidth = barFullWidth * fillFraction * progress;
          const displayedValue = bar.value * progress;
          const color = bar.color ?? "white";

          return (
            <g key={i}>
              {/* Left label */}
              <text
                x={barAreaLeft - 16}
                y={cy + 5}
                fill="white"
                fontSize={20}
                fontFamily="ui-monospace, monospace"
                textAnchor="end"
                opacity={labelOpacity}
              >
                {bar.label}
              </text>

              {/* Outline (full bar width) */}
              <rect
                x={barAreaLeft}
                y={barTop}
                width={barFullWidth}
                height={barHeight}
                fill="none"
                stroke="white"
                strokeWidth={1.4}
                opacity={0.4 * labelOpacity}
              />

              {/* Filled portion (grows from left) */}
              <rect
                x={barAreaLeft}
                y={barTop}
                width={fillWidth}
                height={barHeight}
                fill={color}
                opacity={0.85}
                filter="url(#sbGlow)"
              />

              {/* Glowing leading tip during fill */}
              {progress > 0 && progress < 1 ? (
                <circle
                  cx={barAreaLeft + fillWidth}
                  cy={cy}
                  r={6}
                  fill={color}
                  filter="url(#sbGlow)"
                />
              ) : null}

              {/* Numeric value, counts up */}
              <text
                x={barAreaRight + 16}
                y={cy + 6}
                fill="white"
                fontSize={22}
                fontFamily="ui-monospace, monospace"
                opacity={valueOpacity}
              >
                {formatNumeric(displayedValue, bar.value)}
                {unit ? ` ${unit}` : ""}
              </text>
            </g>
          );
        })}

        {/* Simplified ratio under the bars */}
        {ratioText ? (
          <text
            x={width / 2}
            y={startY + totalHeight + 56}
            fill="white"
            fontSize={28}
            fontFamily="ui-monospace, monospace"
            textAnchor="middle"
            opacity={fadeOpacity({
              framesSinceBeatStart: frame,
              fps,
              appear_s: RATIO_START_MS / 1000,
              fadeMs: 400,
            })}
          >
            {`Ratio: ${ratioText}`}
          </text>
        ) : null}
      </svg>
    </>
  );
}

function gcd(a: number, b: number): number {
  if (b === 0) return Math.abs(a);
  return gcd(b, a % b);
}

/** Match the precision of `target` while interpolating to it. Integers
 *  stay integers; decimals round to the same precision as the target. */
function formatNumeric(current: number, target: number): string {
  // Smooth ease-out so the final number lands cleanly.
  const eased = interpolate(current, [0, target], [0, target], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (Number.isInteger(target)) {
    return String(Math.round(eased));
  }
  // Pick precision from the target's string representation.
  const decimals = (target.toString().split(".")[1] ?? "").length;
  return eased.toFixed(Math.min(2, decimals));
}
