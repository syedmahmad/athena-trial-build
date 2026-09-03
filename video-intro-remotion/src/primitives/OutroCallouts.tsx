import { useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Outro beat — dense particle wave terrain background.
 *
 * Each particle shimmers in brightness and drifts subtly, and a slow
 * brightness wave travels across rows. Corner callouts are rendered by
 * the OverlayLayer (single source of truth) — props that previously drove
 * callouts here are accepted for backwards compatibility but ignored.
 */
export function OutroCallouts({
  beatDurationFrames: _beatDurationFrames,
}: {
  background?: string;
  callouts_top_left?: string;
  callouts_top_right?: string;
  callouts_bottom_left?: string;
  callouts_bottom_right?: string;
  beatDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = frame / fps;

  const COLS = 140;
  const ROWS = 60;
  const particles: Array<{ x: number; y: number; b: number }> = [];
  const baseY = height * 0.55;
  const amplitude = height * 0.22;
  let idx = 0;
  for (let r = 0; r < ROWS; r++) {
    const rowDepth = r / (ROWS - 1);
    const yShift = rowDepth * height * 0.35;
    const rowWave = 0.85 + 0.15 * Math.sin(t * 0.9 - r * 0.18);
    for (let c = 0; c < COLS; c++) {
      const cxNorm = (c / (COLS - 1)) * 2 - 1;
      const wave =
        Math.exp(-Math.pow(cxNorm + 0.4, 2) / 0.18) * 0.6 +
        Math.exp(-Math.pow(cxNorm - 0.5, 2) / 0.3) * 0.45 +
        0.1 * Math.sin(cxNorm * 8 + rowDepth * 4 + t * 0.4);
      const x = c * (width / (COLS - 1));
      const y = baseY - wave * amplitude * (1 - rowDepth * 0.4) + yShift;
      const shimmer = 0.9 + 0.1 * Math.sin(t * 1.6 + idx * 0.29);
      const jx = Math.cos(idx * 1.5 + t * 1.1) * 0.4;
      const jy = Math.sin(idx * 0.7 + t * 0.9) * 0.4;
      const baseB = Math.max(0.25, 1 - rowDepth * 0.6);
      particles.push({
        x: x + jx,
        y: y + jy,
        b: Math.min(1, baseB * shimmer * rowWave),
      });
      idx++;
    }
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0 }}
    >
      <defs>
        <filter id="outroGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#outroGlow)">
        {particles.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={1.4}
            fill="white"
            fillOpacity={p.b}
          />
        ))}
      </g>
    </svg>
  );
}
