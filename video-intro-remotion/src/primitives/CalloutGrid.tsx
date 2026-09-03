import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { fadeOpacity } from "../utils/timing";
import { WireframeTerrainBackground } from "./WireframeTerrainBackground";

/**
 * Grid of text callouts — generalization of OutroCallouts for any
 * beat that needs to surface multiple short pieces of information
 * simultaneously. Useful for: "what we'll cover" agenda, key
 * takeaways, side-by-side definition comparisons, vocab lists.
 *
 * Layouts:
 *   - `2x2` — 4 cells in a grid (default; matches OutroCallouts).
 *   - `1x4` — 4 cells in one row, full width each (use for narrow
 *             phrases).
 *   - `1x3` — 3 cells in one row.
 *
 * Each cell renders an optional heading + body. The `accent: "primary"`
 * cell gets a subtle highlight pulse to draw the eye.
 *
 * Animation:
 *   - Cells fade up sequentially with `stagger_ms` between them.
 *   - Primary cell pulses softly after settle.
 */
type CalloutCell = {
  heading?: string;
  body: string;
  accent?: "primary" | "default";
};

export function CalloutGrid({
  layout = "2x2",
  cells,
  background = "wireframe_terrain",
  stagger_ms = 220,
  beatDurationFrames: _beatDurationFrames,
}: {
  layout?: "2x2" | "1x4" | "1x3";
  cells: CalloutCell[];
  background?: "wireframe_terrain" | "blank";
  stagger_ms?: number;
  beatDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const tSec = frame / fps;
  const showBackground = background === "wireframe_terrain";

  // Layout geometry.
  const { positions, cellWidth, cellHeight } = computeLayout(
    layout,
    cells.length,
    width,
    height,
  );

  return (
    <>
      {showBackground ? <WireframeTerrainBackground opacity={0.65} /> : null}
      {cells.map((cell, i) => {
        if (i >= positions.length) return null;
        const pos = positions[i];
        const appearS = (i * stagger_ms) / 1000;
        const opacity = fadeOpacity({
          framesSinceBeatStart: frame,
          fps,
          appear_s: appearS,
          fadeMs: 420,
        });
        // Cells slide up subtly as they fade in.
        const slideY = interpolate(opacity, [0, 1], [16, 0], {
          easing: Easing.out(Easing.cubic),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        const isPrimary = cell.accent === "primary";
        const settled = opacity >= 1;
        const pulseT = settled ? tSec - (appearS + 0.42) : 0;
        const pulseAlpha = isPrimary && settled
          ? 0.08 + 0.06 * (1 + Math.sin(pulseT * 1.7)) * 0.5
          : 0;
        const textBrightness = isPrimary && settled
          ? 0.93 + 0.07 * (1 + Math.sin(pulseT * 1.7)) * 0.5
          : 1;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: pos.x,
              top: pos.y,
              width: cellWidth,
              height: cellHeight,
              opacity,
              transform: `translateY(${slideY}px)`,
              padding: 24,
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              color: "white",
              fontFamily: "ui-monospace, monospace",
              background: `rgba(255, 255, 255, ${pulseAlpha})`,
              borderLeft: isPrimary
                ? "2px solid rgba(255, 255, 255, 0.85)"
                : "1px solid rgba(255, 255, 255, 0.18)",
              borderRadius: 2,
            }}
          >
            {cell.heading ? (
              <div
                style={{
                  fontSize: 14,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  opacity: 0.65 * textBrightness,
                  marginBottom: 10,
                }}
              >
                {cell.heading}
              </div>
            ) : null}
            <div
              style={{
                fontSize: 22,
                lineHeight: 1.35,
                opacity: textBrightness,
              }}
            >
              {cell.body}
            </div>
          </div>
        );
      })}
    </>
  );
}

function computeLayout(
  layout: "2x2" | "1x4" | "1x3",
  cellCount: number,
  width: number,
  height: number,
): { positions: Array<{ x: number; y: number }>; cellWidth: number; cellHeight: number } {
  const marginX = width * 0.08;
  const marginY = height * 0.12;
  const innerW = width - marginX * 2;
  const innerH = height - marginY * 2;
  const gap = 20;

  if (layout === "1x4") {
    const cellWidth = (innerW - gap * 3) / 4;
    const cellHeight = innerH;
    const positions = Array.from({ length: 4 }).map((_, i) => ({
      x: marginX + i * (cellWidth + gap),
      y: marginY,
    }));
    return { positions: positions.slice(0, cellCount), cellWidth, cellHeight };
  }
  if (layout === "1x3") {
    const cellWidth = (innerW - gap * 2) / 3;
    const cellHeight = innerH;
    const positions = Array.from({ length: 3 }).map((_, i) => ({
      x: marginX + i * (cellWidth + gap),
      y: marginY,
    }));
    return { positions: positions.slice(0, cellCount), cellWidth, cellHeight };
  }
  // 2x2 default.
  const cellWidth = (innerW - gap) / 2;
  const cellHeight = (innerH - gap) / 2;
  const positions = Array.from({ length: 4 }).map((_, i) => ({
    x: marginX + (i % 2) * (cellWidth + gap),
    y: marginY + Math.floor(i / 2) * (cellHeight + gap),
  }));
  return { positions: positions.slice(0, cellCount), cellWidth, cellHeight };
}
