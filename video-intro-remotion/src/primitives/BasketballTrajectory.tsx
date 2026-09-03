import { useCurrentFrame, useVideoConfig } from "remotion";
import { drawProgress } from "../utils/timing";

/**
 * Animated basketball following a parabolic trajectory from shooter to hoop,
 * with the arc path traced as a glowing curve. Perfect for opening beats that
 * connect sports to quadratic motion.
 *
 * Animation:
 *   - Arc path traces from launch to hoop (800ms).
 *   - Basketball animates along the path (1200ms, starts 300ms after trace begins).
 *   - All elements have living treatment: shimmer, subtle jitter, and breath.
 *   - Hoop pulses gently once the ball reaches it.
 */
export function BasketballTrajectory({
  show_ball = true,
  trajectory_color = "white",
  hoop_position = [8, 3],
  launch_angle = 45,
  show_arc_trace = true,
  beatDurationFrames: _beatDurationFrames,
}: {
  show_ball?: boolean;
  trajectory_color?: string;
  hoop_position?: [number, number];
  launch_angle?: number;
  show_arc_trace?: boolean;
  beatDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const tSec = frame / fps;

  // Court layout - shooter at bottom left, hoop at specified position
  const courtLeft = width * 0.1;
  const courtRight = width * 0.9;
  const courtTop = height * 0.1;
  const courtBottom = height * 0.85;
  const courtWidth = courtRight - courtLeft;
  const courtHeight = courtBottom - courtTop;

  // Shooter position (bottom left area)
  const shooterX = courtLeft + courtWidth * 0.15;
  const shooterY = courtBottom - courtHeight * 0.1;

  // Hoop position from props (normalized to court space)
  const [hoopDataX, hoopDataY] = hoop_position;
  const hoopX = courtLeft + (hoopDataX / 10) * courtWidth;
  const hoopY = courtBottom - (hoopDataY / 10) * courtHeight;

  // Physics calculation for parabolic trajectory
  const dx = hoopX - shooterX;
  const dy = hoopY - shooterY;
  const angleRad = (launch_angle * Math.PI) / 180;
  
  // Calculate initial velocity components needed to reach the hoop
  const gravity = 980; // pixels/sec^2 (adjusted for screen space)
  const timeToTarget = Math.sqrt((2 * Math.abs(dy)) / gravity + Math.pow(dx / (Math.cos(angleRad) * Math.sqrt(2 * gravity * Math.abs(dy))), 2));
  const v0 = dx / (Math.cos(angleRad) * timeToTarget);
  const v0x = v0 * Math.cos(angleRad);
  const v0y = v0 * Math.sin(angleRad);

  // Animation timings
  const TRACE_START = 200;
  const TRACE_DUR = 800;
  const BALL_START = 500;
  const BALL_DUR = 1200;

  const traceProgress = drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: TRACE_START,
    durationMs: TRACE_DUR,
  });

  const ballProgress = drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: BALL_START,
    durationMs: BALL_DUR,
  });

  // Generate trajectory path points
  const pathPoints: Array<{ x: number; y: number }> = [];
  const numPoints = 100;
  for (let i = 0; i <= numPoints; i++) {
    const t = (i / numPoints) * timeToTarget;
    const x = shooterX + v0x * t;
    const y = shooterY + v0y * t - 0.5 * gravity * t * t;
    pathPoints.push({ x, y });
  }

  // Current ball position
  const ballT = ballProgress * timeToTarget;
  const ballX = shooterX + v0x * ballT + Math.cos(tSec * 1.3 + 0.5) * 0.3; // jitter
  const ballY = shooterY + v0y * ballT - 0.5 * gravity * ballT * ballT + Math.sin(tSec * 1.1 + 0.8) * 0.3; // jitter

  // Ball rotation based on forward motion
  const ballRotation = ballProgress * 720; // Two full rotations during flight

  // Hoop pulse when ball arrives
  const ballAtHoop = ballProgress >= 0.95;
  const hoopPulse = ballAtHoop ? 1 + 0.08 * (1 + Math.sin(tSec * 2.4)) * 0.5 : 1;

  // Visible portion of the path based on trace progress
  const visiblePoints = Math.floor(pathPoints.length * traceProgress);
  const visiblePathD = pathPoints.slice(0, visiblePoints + 1).reduce((path, point, i) => {
    const command = i === 0 ? 'M' : 'L';
    return `${path} ${command} ${point.x} ${point.y}`;
  }, '').trim();

  // Living treatment opacity for trajectory
  const trajectoryShimmer = 0.85 + 0.15 * Math.sin(tSec * 1.8 + 0.31);
  const trajectoryColor = trajectory_color === "white" ? "white" : trajectory_color;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0 }}
    >
      <defs>
        <filter id="trajectoryGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="ballGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <pattern id="basketballPattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="9" fill="none" stroke="white" strokeWidth="1" opacity="0.8"/>
          <path d="M 1 10 L 19 10 M 10 1 L 10 19" stroke="white" strokeWidth="1" opacity="0.6"/>
        </pattern>
      </defs>

      {/* Basketball court outline (subtle) */}
      <rect
        x={courtLeft}
        y={courtTop}
        width={courtWidth}
        height={courtHeight}
        fill="none"
        stroke="white"
        strokeWidth={1}
        opacity={0.15 + 0.05 * Math.sin(tSec * 1.2)}
      />

      {/* Trajectory arc */}
      {show_arc_trace && visiblePathD && (
        <g filter="url(#trajectoryGlow)">
          <path
            d={visiblePathD}
            fill="none"
            stroke={trajectoryColor}
            strokeWidth={3}
            strokeLinecap="round"
            opacity={trajectoryShimmer}
          />
          {/* Glowing trail tip */}
          {traceProgress > 0 && traceProgress < 1 && visiblePoints > 0 && (
            <circle
              cx={pathPoints[visiblePoints]?.x || 0}
              cy={pathPoints[visiblePoints]?.y || 0}
              r={6}
              fill={trajectoryColor}
              opacity={0.8}
            />
          )}
        </g>
      )}

      {/* Basketball */}
      {show_ball && ballProgress > 0 && (
        <g
          transform={`translate(${ballX} ${ballY}) rotate(${ballRotation}) translate(${-ballX} ${-ballY})`}
          filter="url(#ballGlow)"
        >
          <circle
            cx={ballX}
            cy={ballY}
            r={12}
            fill="url(#basketballPattern)"
            opacity={0.9 + 0.1 * Math.sin(tSec * 1.6 + 0.7)}
          />
          <circle
            cx={ballX}
            cy={ballY}
            r={12}
            fill="none"
            stroke="white"
            strokeWidth={2}
            opacity={0.6}
          />
        </g>
      )}

      {/* Basketball hoop */}
      <g transform={`translate(${hoopX} ${hoopY}) scale(${hoopPulse}) translate(${-hoopX} ${-hoopY})`}>
        {/* Backboard */}
        <rect
          x={hoopX + 15}
          y={hoopY - 25}
          width={4}
          height={50}
          fill="white"
          opacity={0.7 + 0.1 * Math.sin(tSec * 1.4 + 1.2)}
        />
        {/* Rim */}
        <ellipse
          cx={hoopX}
          cy={hoopY}
          rx={25}
          ry={6}
          fill="none"
          stroke="white"
          strokeWidth={3}
          opacity={0.85 + 0.15 * Math.sin(tSec * 1.9 + 0.9)}
        />
        {/* Net lines */}
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i / 8) * Math.PI * 2;
          const x1 = hoopX + Math.cos(angle) * 22;
          const y1 = hoopY + Math.sin(angle) * 5;
          const x2 = hoopX + Math.cos(angle) * 15;
          const y2 = hoopY + 20;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="white"
              strokeWidth={1}
              opacity={0.4 + 0.1 * Math.sin(tSec * 1.5 + i * 0.4)}
            />
          );
        })}
      </g>

      {/* Shooter (simple figure) */}
      <g opacity={0.6 + 0.1 * Math.sin(tSec * 1.3 + 2.1)}>
        <circle
          cx={shooterX}
          cy={shooterY - 35}
          r={8}
          fill="white"
          opacity={0.8}
        />
        <rect
          x={shooterX - 6}
          y={shooterY - 25}
          width={12}
          height={25}
          fill="white"
          opacity={0.7}
        />
      </g>
    </svg>
  );
}