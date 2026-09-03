import { useVideoConfig } from "remotion";

/**
 * Wireframe parabolic satellite dish in cross-section with signal ray
 * lines converging at the focal point. Draws a quadratic-bezier dish
 * curve, an axis of symmetry, parallel incoming rays that reflect to
 * the focal point, and an optional focus marker.
 */
export function SatelliteDish({
  dish_width: _dish_width = 10,
  focal_length: _focal_length = 2.5,
  num_rays: _num_rays = 5,
  draw_in_ms: _draw_in_ms = 1200,
  ray_animate_ms: _ray_animate_ms = 1500,
  show_focus_marker = true,
  beatDurationFrames: _beatDurationFrames,
}: {
  dish_width?: number;
  focal_length?: number;
  num_rays?: number;
  draw_in_ms?: number;
  ray_animate_ms?: number;
  show_focus_marker?: boolean;
  beatDurationFrames: number;
}) {
  const { width, height } = useVideoConfig();

  // ── canonical canvas geometry (spec: 1280×720) ──────────────────
  // All coordinates are specified against the 1280×720 sketch and then
  // scaled proportionally so the component works at any resolution.
  const scaleX = width / 1280;
  const scaleY = height / 720;

  // Parabola: quadratic bezier (340,260) → vertex (640,520) → (940,260)
  const parabolaStart = { x: 340 * scaleX, y: 260 * scaleY };
  const parabolaVertex = { x: 640 * scaleX, y: 520 * scaleY };
  const parabolaEnd = { x: 940 * scaleX, y: 260 * scaleY };

  // The SVG quadratic bezier control point that produces the parabolic
  // shape. We want Q cx,cy to pass through the vertex at t=0.5.
  // For a quadratic bezier B(0.5) = 0.25*P0 + 0.5*CP + 0.25*P2 = Vertex
  // => CP = 2*Vertex - 0.5*(P0+P2)
  const cpX = 2 * parabolaVertex.x - 0.5 * (parabolaStart.x + parabolaEnd.x);
  const cpY = 2 * parabolaVertex.y - 0.5 * (parabolaStart.y + parabolaEnd.y);

  // Axis of symmetry: (640,520) → (640,200)
  const axisX = 640 * scaleX;
  const axisBottom = 520 * scaleY;
  const axisTop = 200 * scaleY;

  // Focus marker: (640, 370)
  const focusX = 640 * scaleX;
  const focusY = 370 * scaleY;
  const focusR = 8 * Math.min(scaleX, scaleY);

  // Label 'Focus': (672, 365)
  const labelX = 672 * scaleX;
  const labelY = 365 * scaleY;

  // Ray definitions — each ray has a vertical segment and a reflected
  // segment that converges to the focus.
  // Ray 1: (440,200)→(440,345) then →(640,370)
  // Ray 2: (540,200)→(540,310) then →(640,370)
  // Ray 3: (640,200)→(640,370)  — straight down, no bend
  // Ray 4: (740,200)→(740,310) then →(640,370)
  // Ray 5: (840,200)→(840,345) then →(640,370)
  const rayColor = "#00E5FF";
  const rays: Array<{
    x: number;
    yTop: number;
    yDish: number;
    center?: boolean;
  }> = [
    { x: 440, yTop: 200, yDish: 345 },
    { x: 540, yTop: 200, yDish: 310 },
    { x: 640, yTop: 200, yDish: 370, center: true },
    { x: 740, yTop: 200, yDish: 310 },
    { x: 840, yTop: 200, yDish: 345 },
  ];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0 }}
    >
      <defs>
        {/* Glow filter for white linework */}
        <filter id="dishGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Stronger glow for cyan rays and focus */}
        <filter id="cyanGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Tight glow for the focus dot */}
        <filter id="focusGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── Axis of symmetry (dashed, quiet supporting element) ── */}
      <line
        x1={axisX}
        y1={axisBottom}
        x2={axisX}
        y2={axisTop}
        stroke="white"
        strokeWidth={1}
        strokeDasharray={`${6 * scaleY} ${5 * scaleY}`}
        strokeLinecap="round"
        opacity={0.35}
      />

      {/* ── Signal rays (cyan, secondary-main) ── */}
      <g filter="url(#cyanGlow)">
        {rays.map((ray, i) => {
          const rx = ray.x * scaleX;
          const ryTop = ray.yTop * scaleY;
          const ryDish = ray.yDish * scaleY;

          if (ray.center) {
            // Center ray: straight vertical line from top to focus
            return (
              <line
                key={i}
                x1={rx}
                y1={ryTop}
                x2={focusX}
                y2={focusY}
                stroke={rayColor}
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.7}
              />
            );
          }

          // Two-segment ray: vertical down to dish surface, then angled to focus
          const pathD = `M ${rx} ${ryTop} L ${rx} ${ryDish} L ${focusX} ${focusY}`;
          return (
            <path
              key={i}
              d={pathD}
              stroke={rayColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={0.7}
            />
          );
        })}
      </g>

      {/* ── Parabola (MAIN — white, stroke-width 3, glowing) ── */}
      <g filter="url(#dishGlow)">
        <path
          d={`M ${parabolaStart.x} ${parabolaStart.y} Q ${cpX} ${cpY} ${parabolaEnd.x} ${parabolaEnd.y}`}
          stroke="white"
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
          opacity={0.9}
        />
      </g>

      {/* ── Focus marker + label (MAIN anchor) ── */}
      {show_focus_marker ? (
        <>
          {/* Outer halo glow */}
          <circle
            cx={focusX}
            cy={focusY}
            r={focusR * 2.8}
            fill="#00E5FF"
            opacity={0.12}
            filter="url(#focusGlow)"
          />
          {/* Core dot */}
          <circle
            cx={focusX}
            cy={focusY}
            r={focusR}
            fill="#00E5FF"
            opacity={0.95}
            filter="url(#focusGlow)"
          />
          {/* Label */}
          <text
            x={labelX}
            y={labelY}
            fill="white"
            fontSize={18 * Math.min(scaleX, scaleY)}
            fontFamily="ui-monospace, monospace"
            dominantBaseline="middle"
            opacity={0.8}
          >
            Focus
          </text>
        </>
      ) : null}
    </svg>
  );
}
