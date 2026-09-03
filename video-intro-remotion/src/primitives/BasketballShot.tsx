import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { drawProgress, fadeOpacity } from "../utils/timing";

/**
 * Wireframe basketball shot: a ball travels along a parabolic arc from a
 * release point to a hoop rim. The rim is a large circle with short diagonal
 * net-hatching lines beneath it. A dashed trail traces the arc. The ball is
 * a thick-stroked circle with cross-seam lines inside so it reads as a
 * basketball.
 */
export function BasketballShot({
  release_position = [220, 560],
  rim_position = [980, 320],
  peak_height_pixels = 220,
  show_trail = true,
  show_court_floor = true,
  ball_radius = 22,
  beatDurationFrames: _beatDurationFrames,
}: {
  release_position?: [number, number];
  rim_position?: [number, number];
  peak_height_pixels?: number;
  show_trail?: boolean;
  show_court_floor?: boolean;
  ball_radius?: number;
  beatDurationFrames: number;
}) {
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const tSec = frame / fps;

  // Scale from canonical 1280×720
  const scaleX = width / 1280;
  const scaleY = height / 720;
  const scale = Math.min(scaleX, scaleY);

  // ── Parabola geometry ────────────────────────────────────────────
  const rx = release_position[0] * scaleX;
  const ry = release_position[1] * scaleY;
  const rimX = rim_position[0] * scaleX;
  const rimY = rim_position[1] * scaleY;

  // Apex: horizontally centered, above the lower of the two y values
  const apexX = (rx + rimX) / 2;
  const topY = Math.min(ry, rimY);
  const apexY = topY - peak_height_pixels * scaleY;

  // Quadratic bezier control point that places apex at t=0.5:
  // B(0.5) = 0.25*P0 + 0.5*CP + 0.25*P2 = Apex
  // => CP = 2*Apex - 0.5*(P0 + P2)
  const cpX = 2 * apexX - 0.5 * (rx + rimX);
  const cpY = 2 * apexY - 0.5 * (ry + rimY);

  // ── Reveal timings ───────────────────────────────────────────────
  const trailProgress = drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: 0,
    durationMs: 900,
  });

  const ballT = drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: 0,
    durationMs: 1100,
  });

  const rimOpacity = fadeOpacity({
    framesSinceBeatStart: frame,
    fps,
    appear_s: 0.0,
    fadeMs: 350,
  });

  const netOpacities = [0, 80, 160, 240].map((delayMs) =>
    fadeOpacity({
      framesSinceBeatStart: frame,
      fps,
      appear_s: 0.15 + delayMs / 1000,
      fadeMs: 300,
    })
  );

  const boardOpacity = fadeOpacity({
    framesSinceBeatStart: frame,
    fps,
    appear_s: 0.0,
    fadeMs: 350,
  });

  const ballFade = fadeOpacity({
    framesSinceBeatStart: frame,
    fps,
    appear_s: 0.0,
    fadeMs: 200,
  });

  const labelOpacity = fadeOpacity({
    framesSinceBeatStart: frame,
    fps,
    appear_s: 0.7,
    fadeMs: 400,
  });

  // ── Ball position along quadratic bezier ─────────────────────────
  const t = ballT;
  const ballX = (1 - t) * (1 - t) * rx + 2 * t * (1 - t) * cpX + t * t * rimX;
  const ballY = (1 - t) * (1 - t) * ry + 2 * t * (1 - t) * cpY + t * t * rimY;

  const br = ball_radius * scale;

  // ── Rim geometry ─────────────────────────────────────────────────
  // Large enough to be clearly recognizable as a hoop
  const rimRadius = 38 * scale;

  // ── Rim arrival boost ────────────────────────────────────────────
  const rimArrived = interpolate(t, [0.85, 1.0], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Net hatching: 5 diagonal lines below rim ─────────────────────
  // Lines spread from rim bottom-left to bottom-right, angling downward
  const netBaseY = rimY + rimRadius;
  const netBottomSpread = 28 * scale;
  const netDepth = 48 * scale;
  const netLines = [
    { x1: rimX - rimRadius * 0.85, y1: netBaseY, x2: rimX - rimRadius * 0.85 - netBottomSpread * 0.4, y2: netBaseY + netDepth * 0.85 },
    { x1: rimX - rimRadius * 0.42, y1: netBaseY, x2: rimX - rimRadius * 0.42 - netBottomSpread * 0.15, y2: netBaseY + netDepth },
    { x1: rimX,                    y1: netBaseY, x2: rimX,                                               y2: netBaseY + netDepth * 1.05 },
    { x1: rimX + rimRadius * 0.42, y1: netBaseY, x2: rimX + rimRadius * 0.42 + netBottomSpread * 0.15, y2: netBaseY + netDepth },
    { x1: rimX + rimRadius * 0.85, y1: netBaseY, x2: rimX + rimRadius * 0.85 + netBottomSpread * 0.4, y2: netBaseY + netDepth * 0.85 },
  ];

  // ── Backboard ────────────────────────────────────────────────────
  // Tall vertical line to the right of the rim
  const boardX = rimX + rimRadius + 28 * scale;
  const boardTop = rimY - 70 * scale;
  const boardBottom = rimY + 70 * scale;
  // Short horizontal connector from rim to board
  const connectorY = rimY;

  // ── Court floor ──────────────────────────────────────────────────
  const floorY = Math.max(ry, rimY + 180 * scaleY);
  const floorX1 = Math.min(rx, rimX) - 60 * scaleX;
  const floorX2 = Math.max(rx, rimX) + 100 * scaleX;

  // ── Trail dash animation via pathLength + strokeDashoffset ───────
  // Use a fixed pathLength on the <path> element so dashoffset is predictable
  const PATH_LEN = 1000;
  const trailDashArray = `${14 * scale} ${8 * scale}`;
  // Reveal: offset goes from PATH_LEN (hidden) to 0 (fully drawn)
  const trailDashOffset = PATH_LEN * (1 - trailProgress);

  // ── Living treatment — shimmer & jitter ──────────────────────────
  const ballShimmer = 0.88 + 0.12 * Math.sin(tSec * 1.8 + 0 * 0.31);
  const ballJx = Math.cos(0 * 1.7 + tSec * 1.3) * 0.4;
  const ballJy = Math.sin(0 * 2.1 + tSec * 1.1) * 0.35;

  const rimShimmerBase = 0.88 + 0.12 * Math.sin(tSec * 1.8 + 1 * 0.31);
  const rimShimmer = Math.min(1, rimShimmerBase + rimArrived * 0.1 * Math.sin(tSec * 3.4));
  const rimJx = Math.cos(1 * 1.7 + tSec * 1.3) * 0.35;
  const rimJy = Math.sin(1 * 2.1 + tSec * 1.1) * 0.3;

  const trailShimmer = 0.85 + 0.15 * Math.sin(tSec * 1.8 + 2 * 0.31);
  const boardShimmer = 0.85 + 0.15 * Math.sin(tSec * 1.8 + 3 * 0.31);
  const labelShimmer = 0.85 + 0.15 * Math.sin(tSec * 1.8 + 4 * 0.31);

  const netBreaths = netLines.map((_, i) =>
    0.55 + 0.25 * Math.sin(tSec * 0.9 - i * 0.2)
  );

  // Net stagger opacity (use netOpacities cycling over 4 entries for 5 lines)
  const netFades = netLines.map((_, i) => netOpacities[Math.min(i, 3)]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0 }}
    >
      <defs>
        {/* General white glow */}
        <filter id="shotGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Rim glow — amber accent */}
        <filter id="rimGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Tight ball glow */}
        <filter id="ballGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── Court floor dashed line ── */}
      {show_court_floor ? (
        <line
          x1={floorX1}
          y1={floorY}
          x2={floorX2}
          y2={floorY}
          stroke="white"
          strokeWidth={1.5}
          strokeDasharray={`${8 * scale} ${10 * scale}`}
          strokeLinecap="round"
          opacity={0.28}
        />
      ) : null}

      {/* ── Parabolic trail (dashed, progressive draw) ── */}
      {show_trail ? (
        <g filter="url(#shotGlow)" opacity={trailShimmer * 0.9}>
          <path
            d={`M ${rx} ${ry} Q ${cpX} ${cpY} ${rimX} ${rimY}`}
            stroke="white"
            strokeWidth={2.5}
            strokeDasharray={trailDashArray}
            strokeDashoffset={trailDashOffset}
            strokeLinecap="round"
            fill="none"
            pathLength={PATH_LEN}
          />
        </g>
      ) : null}

      {/* ── Backboard: vertical bar + horizontal connector to rim ── */}
      <g opacity={boardOpacity * boardShimmer}>
        {/* Vertical backboard */}
        <line
          x1={boardX}
          y1={boardTop}
          x2={boardX}
          y2={boardBottom}
          stroke="white"
          strokeWidth={2.5}
          strokeLinecap="round"
          opacity={0.7}
        />
        {/* Horizontal connector (rim support arm) */}
        <line
          x1={rimX + rimRadius * 0.85}
          y1={connectorY}
          x2={boardX}
          y2={connectorY}
          stroke="white"
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.55}
        />
        {/* Small square bracket on backboard at rim height */}
        <rect
          x={boardX - 4 * scale}
          y={connectorY - 10 * scale}
          width={12 * scale}
          height={20 * scale}
          stroke="white"
          strokeWidth={1.5}
          fill="none"
          opacity={0.45}
        />
      </g>

      {/* ── Rim circle (amber accent, large and legible) ── */}
      <g
        filter="url(#rimGlow)"
        transform={`translate(${rimJx}, ${rimJy})`}
        opacity={rimOpacity}
      >
        <circle
          cx={rimX}
          cy={rimY}
          r={rimRadius}
          stroke="oklch(0.72 0.16 80)"
          strokeWidth={3.5}
          fill="none"
          opacity={0.95 * rimShimmer}
        />
      </g>

      {/* ── Net hatching below rim (5 diagonal lines, staggered fade) ── */}
      {netLines.map((l, i) => (
        <line
          key={i}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke="white"
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={netFades[i] * 0.55 * netBreaths[i]}
        />
      ))}
      {/* Horizontal cross-lines of the net at two depths */}
      {[0.35, 0.7].map((frac, j) => {
        const netY = netBaseY + netDepth * frac;
        const halfW = rimRadius * (1 - frac * 0.35);
        const crossFade = netOpacities[Math.min(j + 1, 3)];
        const crossBreath = 0.55 + 0.22 * Math.sin(tSec * 0.9 - (j + 5) * 0.2);
        return (
          <line
            key={`cross-${j}`}
            x1={rimX - halfW}
            y1={netY}
            x2={rimX + halfW}
            y2={netY}
            stroke="white"
            strokeWidth={1}
            strokeLinecap="round"
            opacity={crossFade * 0.45 * crossBreath}
          />
        );
      })}

      {/* ── Basketball (main element, travels along arc) ── */}
      <g
        filter="url(#ballGlow)"
        transform={`translate(${ballJx}, ${ballJy})`}
        opacity={ballFade * ballShimmer}
      >
        {/* Outer circle — thick stroke so ball reads clearly */}
        <circle
          cx={ballX}
          cy={ballY}
          r={br}
          stroke="white"
          strokeWidth={3}
          fill="none"
          opacity={0.95}
        />
        {/* Horizontal seam */}
        <path
          d={`M ${ballX - br * 0.95} ${ballY} Q ${ballX} ${ballY - br * 0.45} ${ballX + br * 0.95} ${ballY}`}
          stroke="white"
          strokeWidth={1.5}
          strokeLinecap="round"
          fill="none"
          opacity={0.7}
        />
        {/* Vertical seam */}
        <path
          d={`M ${ballX} ${ballY - br * 0.95} Q ${ballX + br * 0.45} ${ballY} ${ballX} ${ballY + br * 0.95}`}
          stroke="white"
          strokeWidth={1.5}
          strokeLinecap="round"
          fill="none"
          opacity={0.7}
        />
      </g>

      {/* ── Parabola equation label near apex ── */}
      <text
        x={apexX - 90 * scale}
        y={apexY - 28 * scale}
        fill="white"
        fontSize={Math.round(18 * scale)}
        fontFamily="ui-monospace, monospace"
        textAnchor="middle"
        opacity={labelOpacity * 0.65 * labelShimmer}
      >
        y = ax² + bx + c
      </text>
    </svg>
  );
}
