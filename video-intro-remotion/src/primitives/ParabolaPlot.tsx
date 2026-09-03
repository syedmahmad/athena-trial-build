import { useCurrentFrame, useVideoConfig } from "remotion";
import { drawProgress, fadeOpacity } from "../utils/timing";
import { CoordinateAxes } from "./CoordinateAxes";

/**
 * Plots y = ax^2 + bx + c on a coordinate plane with an optional vertex marker.
 * The parabola draws from left to right as a glowing curve.
 *
 * Animation:
 *   - Coordinate axes establish over ~700ms
 *   - Parabola curve draws smoothly from left to right (800ms)
 *   - Vertex marker appears with a subtle pop if enabled
 *   - Continuous living treatment: curve shimmers, vertex breathes
 *
 * Used for quadratic function lessons to visualize the parabola shape,
 * highlight the vertex, and demonstrate key properties of quadratic functions.
 */
export function ParabolaPlot({
  a,
  b,
  c,
  x_range = [-5, 5],
  show_vertex = false,
  color = "white",
  beatDurationFrames: _beatDurationFrames,
}: {
  a: number;
  b: number;
  c: number;
  x_range?: [number, number];
  show_vertex?: boolean;
  color?: string;
  beatDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const tSec = frame / fps;

  // Calculate vertex coordinates: x = -b/(2a), y = a*x^2 + b*x + c
  const vertexX = -b / (2 * a);
  const vertexY = a * vertexX * vertexX + b * vertexX + c;

  // Determine y-range based on vertex and x-range to ensure good framing
  const [xMin, xMax] = x_range;
  const yAtXMin = a * xMin * xMin + b * xMin + c;
  const yAtXMax = a * xMax * xMax + b * xMax + c;
  const yValues = [yAtXMin, yAtXMax, vertexY];
  const yMin = Math.min(...yValues) - 1;
  const yMax = Math.max(...yValues) + 1;

  // Plot area calculations (matches CoordinateAxes)
  const plotLeft = width * 0.15;
  const plotRight = width * 0.85;
  const plotTop = height * 0.15;
  const plotBottom = height * 0.85;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  // Coordinate mapping functions
  const sx = (x: number) => plotLeft + ((x - xMin) / (xMax - xMin)) * plotWidth;
  const sy = (y: number) => plotBottom - ((y - yMin) / (yMax - yMin)) * plotHeight;

  // Animation timings
  const AXES_SETTLE_TIME = 1200; // Let axes fully establish
  const CURVE_DRAW_START = AXES_SETTLE_TIME + 200;
  const CURVE_DRAW_DURATION = 800;
  const VERTEX_APPEAR_START = CURVE_DRAW_START + CURVE_DRAW_DURATION + 150;
  const VERTEX_APPEAR_DURATION = 350;

  // Animation progress values
  const curveProgress = drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: CURVE_DRAW_START,
    durationMs: CURVE_DRAW_DURATION,
  });

  const vertexOpacity = show_vertex ? fadeOpacity({
    framesSinceBeatStart: frame,
    fps,
    appear_s: VERTEX_APPEAR_START / 1000,
    fadeMs: VERTEX_APPEAR_DURATION,
  }) : 0;

  // Generate parabola points for smooth curve
  const numPoints = 120;
  const parabolaPoints: Array<{ x: number; y: number; t: number }> = [];
  
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const x = xMin + t * (xMax - xMin);
    const y = a * x * x + b * x + c;
    parabolaPoints.push({ x, y, t });
  }

  // Create SVG path for the parabola with animation
  const visiblePoints = parabolaPoints.filter(p => p.t <= curveProgress);
  let pathD = "";
  
  if (visiblePoints.length > 0) {
    pathD = `M ${sx(visiblePoints[0].x)} ${sy(visiblePoints[0].y)}`;
    for (let i = 1; i < visiblePoints.length; i++) {
      pathD += ` L ${sx(visiblePoints[i].x)} ${sy(visiblePoints[i].y)}`;
    }
  }

  // Living treatment effects
  const shimmer = 0.85 + 0.15 * Math.sin(tSec * 1.8 + 0.31);
  const vertexJitterX = Math.cos(tSec * 1.3 + 1.7) * 0.6;
  const vertexJitterY = Math.sin(tSec * 0.9 + 2.1) * 0.6;
  const vertexBreath = 0.7 + 0.3 * Math.sin(tSec * 1.2);

  // Determine stroke color
  const strokeColor = color === "white" ? "white" : 
                     color === "oklch(0.72 0.16 80)" ? "oklch(0.72 0.16 80)" : 
                     color;

  // Leading tip for drawing animation
  const leadingTip = curveProgress > 0 && curveProgress < 1 && visiblePoints.length > 0 ? 
    visiblePoints[visiblePoints.length - 1] : null;

  return (
    <>
      {/* Coordinate axes */}
      <CoordinateAxes
        x_range={x_range}
        y_range={[yMin, yMax]}
        tick_interval={1}
        show_grid={true}
        show_origin_label={true}
        axis_label_x="x"
        axis_label_y="y"
        overlay_on="wireframe_terrain"
        beatDurationFrames={_beatDurationFrames}
      />
      
      {/* Parabola curve overlay */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <filter id="parabolaGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="vertexGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Main parabola curve */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke={strokeColor}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={shimmer}
            filter="url(#parabolaGlow)"
          />
        )}

        {/* Leading tip during draw animation */}
        {leadingTip && (
          <circle
            cx={sx(leadingTip.x)}
            cy={sy(leadingTip.y)}
            r={5}
            fill={strokeColor}
            opacity={0.9}
            filter="url(#parabolaGlow)"
          />
        )}

        {/* Vertex marker */}
        {show_vertex && vertexOpacity > 0 && (
          <g
            transform={`translate(${sx(vertexX) + vertexJitterX} ${sy(vertexY) + vertexJitterY})`}
            opacity={vertexOpacity * vertexBreath}
            filter="url(#vertexGlow)"
          >
            {/* Outer ring */}
            <circle
              r={8}
              fill="none"
              stroke={strokeColor}
              strokeWidth={2}
            />
            {/* Inner dot */}
            <circle
              r={3}
              fill={strokeColor}
            />
            {/* Vertex coordinate label */}
            <text
              x={12}
              y={-8}
              fill="white"
              fontSize={12}
              fontFamily="ui-monospace, monospace"
              opacity={0.8}
            >
              ({vertexX.toFixed(1)}, {vertexY.toFixed(1)})
            </text>
          </g>
        )}
      </svg>
    </>
  );
}