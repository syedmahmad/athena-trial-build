import { useVideoConfig } from "remotion";

/**
 * Three small wireframe satellite icons arranged in an arc at the top of the frame,
 * with dashed lines converging to a cyan receiver dot at bottom-center.
 * Communicates GPS / triangulation contexts for systems-of-equations intros.
 */
export function SatelliteTriangulation({
  num_satellites = 3,
  show_distance_lines = true,
  animation: _animation = "pulse_signals",
  beatDurationFrames: _beatDurationFrames,
}: {
  num_satellites: number;
  show_distance_lines: boolean;
  animation: "pulse_signals" | "static";
  beatDurationFrames: number;
}) {
  const { width, height } = useVideoConfig();

  const scaleX = width / 1280;
  const scaleY = height / 720;
  const s = Math.min(scaleX, scaleY);

  // ── Satellite positions (up to 4) ────────────────────────────────
  // These match the spec layout for 2-4 satellites spread across the arc.
  const allSatellitePositions: Array<{ x: number; y: number }> = [
    { x: 340, y: 220 },
    { x: 640, y: 180 },
    { x: 940, y: 220 },
    { x: 490, y: 195 }, // 4th satellite if needed, between 1 and 2
  ];

  // For num_satellites=2, use leftmost + rightmost; for 3 use first three; for 4 use all four
  const satelliteSlices: Record<number, number[]> = {
    2: [0, 2],
    3: [0, 1, 2],
    4: [0, 3, 1, 2],
  };
  const count = Math.max(2, Math.min(4, num_satellites));
  const indices = satelliteSlices[count] ?? [0, 1, 2];
  const satellites = indices.map((i) => allSatellitePositions[i]);

  // Receiver dot
  const rx = 640 * scaleX;
  const ry = 520 * scaleY;
  const rDotR = 10 * s;
  const rHaloR = 28 * s;

  // Diamond half-size
  const half = 14 * s;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0 }}
    >
      <defs>
        {/* Soft white glow for satellite diamonds and lines */}
        <filter id="satWhiteGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Cyan glow for receiver dot */}
        <filter id="satCyanGlow" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Subtle glow for dashed lines */}
        <filter id="satLineGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── Dashed distance lines (SUPPORTING) ───────────────────── */}
      {show_distance_lines && (
        <g filter="url(#satLineGlow)">
          {satellites.map((sat, i) => {
            // Line starts just below the diamond tip
            const x1 = sat.x * scaleX;
            const y1 = (sat.y + half / scaleY + 4) * scaleY;
            const x2 = rx;
            const y2 = ry - rDotR;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="white"
                strokeWidth={1.5}
                strokeDasharray={`${10 * s} ${6 * s}`}
                strokeLinecap="round"
                opacity={0.5}
              />
            );
          })}
        </g>
      )}

      {/* ── Satellite diamond markers (MAIN) ─────────────────────── */}
      <g filter="url(#satWhiteGlow)">
        {satellites.map((sat, i) => {
          const cx = sat.x * scaleX;
          const cy = sat.y * scaleY;
          // Diamond: rotated square, four points at cardinal positions
          const pts = [
            `${cx},${cy - half}`,       // top
            `${cx + half},${cy}`,        // right
            `${cx},${cy + half}`,        // bottom
            `${cx - half},${cy}`,        // left
          ].join(" ");
          return (
            <polygon
              key={i}
              points={pts}
              stroke="white"
              strokeWidth={2}
              fill="none"
              strokeLinejoin="round"
              opacity={0.85}
            />
          );
        })}
      </g>

      {/* ── Receiver dot — cyan halo then core (MAIN anchor) ──────── */}
      {/* Outer halo */}
      <circle
        cx={rx}
        cy={ry}
        r={rHaloR}
        fill="#00E5FF"
        opacity={0.15}
        filter="url(#satCyanGlow)"
      />
      {/* Core dot */}
      <circle
        cx={rx}
        cy={ry}
        r={rDotR}
        fill="#00E5FF"
        opacity={0.95}
        filter="url(#satCyanGlow)"
      />
    </svg>
  );
}
