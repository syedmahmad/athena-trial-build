import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { drawProgress, fadeOpacity } from "../utils/timing";

/**
 * Wireframe basketball bouncing on a horizontal floor line with geometrically
 * decaying peak heights (h, h·r, h·r², …). Draws the full parabolic-sequence
 * envelope with optional dashed trail and peak height labels.
 */
export function BasketballBounce({
  initial_height_pixels = 380,
  restitution = 0.7,
  num_bounces = 5,
  show_trail = true,
  show_heights = true,
  ball_radius = 18,
  horizontal_speed_pixels_per_s: _horizontal_speed_pixels_per_s = 80,
  beatDurationFrames,
}: {
  initial_height_pixels?: number;
  restitution?: number;
  num_bounces?: number;
  show_trail?: boolean;
  show_heights?: boolean;
  ball_radius?: number;
  horizontal_speed_pixels_per_s?: number;
  beatDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  const tSec = frame / fps;
  // Beat duration in seconds
  const beatDurS = beatDurationFrames / fps;

  // Scale from 1280×720 design canvas
  const scaleX = width / 1280;
  const scaleY = height / 720;
  const sc = Math.min(scaleX, scaleY);

  // ── Floor line ───────────────────────────────────────────────────
  const floorY = 580 * scaleY;
  const floorX1 = 200 * scaleX;
  const floorX2 = 1080 * scaleX;

  // ── Bounce geometry ──────────────────────────────────────────────
  const totalX = floorX2 - floorX1;
  const contactCount = num_bounces + 1;
  const contactXs: number[] = [];
  for (let i = 0; i < contactCount; i++) {
    contactXs.push(floorX1 + (totalX * i) / (contactCount - 1));
  }

  // Peak heights in pixels
  const peaks: Array<{ x: number; y: number; heightPx: number }> = [];
  for (let i = 0; i < num_bounces; i++) {
    const peakHeightCanvas = initial_height_pixels * Math.pow(restitution, i) * scaleY;
    const peakX = (contactXs[i] + contactXs[i + 1]) / 2;
    const peakY = floorY - peakHeightCanvas;
    peaks.push({ x: peakX, y: peakY, heightPx: initial_height_pixels * Math.pow(restitution, i) });
  }

  // ── Parabolic arc path builder (with progress clipping) ──────────
  // Builds a full arc path; we'll clip it via strokeDashoffset for reveal.
  // Also returns total approximate path length for dash trick.
  const buildArcPath = (): string => {
    let d = "";
    for (let i = 0; i < num_bounces; i++) {
      const x0 = contactXs[i];
      const x1 = contactXs[i + 1];
      const { x: px, y: py } = peaks[i];
      const cpX = 2 * px - 0.5 * (x0 + x1);
      const cpY = 2 * py - 0.5 * (floorY + floorY);
      if (i === 0) {
        d += `M ${x0} ${floorY} `;
      }
      d += `Q ${cpX} ${cpY} ${x1} ${floorY} `;
    }
    return d.trim();
  };

  const arcPath = buildArcPath();

  // ── Ball position animated along the arcs ─────────────────────────
  // The ball travels from contact[0] to contact[num_bounces] over the beat.
  // Within each arc segment the ball follows the quadratic bezier analytically.
  // We use a single 0..1 progress over all arcs for simplicity.

  // Overall trail reveal: starts at 0s, completes at (beatDurS - 0.5)s
  const trailRevealDurMs = Math.max(200, (beatDurS - 0.5) * 1000);
  const trailProgress = drawProgress({
    framesSinceBeatStart: frame,
    fps,
    startMs: 0,
    durationMs: trailRevealDurMs,
  });

  // Ball's normalised position along the full horizontal span [0..1]
  const ballNorm = Math.min(trailProgress, 1);

  // Determine which arc segment the ball is in and local t within that arc
  const arcT = ballNorm * num_bounces; // 0..num_bounces
  const arcIdx = Math.min(Math.floor(arcT), num_bounces - 1);
  const localT = arcT - arcIdx; // 0..1 within the arc

  // Quadratic bezier position
  const x0 = contactXs[arcIdx];
  const x1 = contactXs[arcIdx + 1];
  const peak = peaks[arcIdx];
  const cpX = 2 * peak.x - 0.5 * (x0 + x1);
  const cpY = 2 * peak.y - 0.5 * (floorY + floorY);

  const lt = localT;
  const lt1 = 1 - lt;
  const rawBallX = lt1 * lt1 * x0 + 2 * lt1 * lt * cpX + lt * lt * x1;
  const rawBallY = lt1 * lt1 * floorY + 2 * lt1 * lt * cpY + lt * lt * floorY;

  // In the final 500ms settle the ball moves to near the right side (last contact)
  const settleStartS = beatDurS - 0.5;
  const settleProgress =
    tSec > settleStartS
      ? interpolate(tSec, [settleStartS, beatDurS], [0, 1], {
          easing: Easing.out(Easing.cubic),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 0;

  // During settle: ball glides to last contact point at floorY
  const settleX = contactXs[num_bounces];
  const settleY = floorY;
  const ballX = rawBallX + (settleX - rawBallX) * settleProgress;
  const ballY = rawBallY + (settleY - rawBallY) * settleProgress;

  const r = ball_radius * sc;

  // ── Ball rotation angle (slow rotation proportional to horizontal travel) ──
  const rotationDeg = tSec * 60; // 60 deg/sec

  // ── Cyan glow pulse at floor contacts ─────────────────────────────
  // Each contact i happens when arcT crosses i (i = 0..num_bounces)
  // We compute a glow intensity that peaks sharply at each contact
  const contactGlow = (): number => {
    let glow = 0;
    for (let i = 0; i <= num_bounces; i++) {
      const contactNorm = i / num_bounces;
      const distNorm = Math.abs(ballNorm - contactNorm);
      // Sharp pulse: within 0.04 of contact norm in progress space
      const pulse = Math.max(0, 1 - distNorm / 0.04);
      glow = Math.max(glow, pulse);
    }
    return glow;
  };
  const cyanGlow = contactGlow();
  const ballStroke = cyanGlow > 0.01
    ? `rgba(${Math.round(255 * (1 - cyanGlow))},${Math.round(255)},${Math.round(255)},1)`
    : "white";
  const ballGlowStdDev = 3.5 + cyanGlow * 8;

  // ── Shimmer helpers ───────────────────────────────────────────────
  const shimmer = (idx: number) => 0.85 + 0.15 * Math.sin(tSec * 1.8 + idx * 0.31);
  const jitter = (idx: number) => ({
    jx: Math.cos(idx * 1.7 + tSec * 1.3) * 0.4,
    jy: Math.sin(idx * 2.1 + tSec * 1.1) * 0.3,
  });

  // ── Trail reveal via clipPath ─────────────────────────────────────
  // Previously this used a `${6 * sc} ${4 * sc}, ${approxArcLen} ${approxArcLen}`
  // dasharray + animated strokeDashoffset, but mixing small dashes with a
  // path-length-sized "reveal cycle" produced a long visible GAP along
  // the path at any trailProgress < 1 — the cycle's big 1100-unit gap
  // segment would land somewhere mid-arc. Manual fix: use a plain
  // `6 4` dasharray for the dashed look, and reveal left-to-right via
  // a clipPath rect whose width grows with trailProgress. The rect
  // covers the full canvas height so it never clips the arcs vertically.
  const clipWidth = (floorX2 - floorX1) * trailProgress;

  // ── Peak height label data ────────────────────────────────────────
  const subscripts = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];
  const labelData = peaks.map((peak, i) => {
    const sub = i < subscripts.length ? subscripts[i] : String(i);
    const baseFontSize = 16;
    const fontSizeDecay = Math.max(12, baseFontSize - i * 1.0);
    const baseOpacity = 0.8;
    const opacityDecay = Math.max(0.35, baseOpacity - i * 0.12);
    return {
      x: peak.x,
      y: peak.y - 15 * scaleY,
      label: `h${sub} = ${Math.round(peak.heightPx)}`,
      fontSize: fontSizeDecay * sc,
      baseOpacity: opacityDecay,
    };
  });

  // ── Label appear times: staggered as ball reaches each peak apex ───
  // Peak i is reached when ballNorm = (i + 0.5) / num_bounces
  const labelAppearS = peaks.map((_, i) => {
    const normAtPeak = (i + 0.5) / num_bounces;
    // Invert drawProgress to find the time
    const durationS = trailRevealDurMs / 1000;
    // drawProgress is cubic-out; approximate as linear for the appear time
    // (close enough for stagger purposes — the label fades in after ball reaches peak)
    return normAtPeak * durationS;
  });

  // ── Floor line shimmer ─────────────────────────────────────────────
  const floorShimmer = shimmer(99);

  // ── Floor fade-in ─────────────────────────────────────────────────
  const floorFade = fadeOpacity({ framesSinceBeatStart: frame, fps, appear_s: 0, fadeMs: 400 });

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0 }}
    >
      <defs>
        {/* Soft glow for main linework */}
        <filter id="bbGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Tighter glow for ball — dynamic stdDeviation via animate or inline style */}
        <filter id="bbBallGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={ballGlowStdDev} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Cyan pulse glow filter */}
        <filter id="bbCyanGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation={6 + cyanGlow * 10} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Trail-reveal clip: rect grows left-to-right as trailProgress
            increases. Replaces a broken dasharray-based reveal that
            produced visible gap segments along the path. */}
        <clipPath id="bbTrailClip">
          <rect x={floorX1} y={0} width={clipWidth} height={height} />
        </clipPath>
      </defs>

      {/* ── Floor line (secondary-main) ── */}
      <line
        x1={floorX1}
        y1={floorY}
        x2={floorX2}
        y2={floorY}
        stroke="white"
        strokeWidth={2 * sc}
        strokeLinecap="round"
        opacity={0.5 * floorShimmer * floorFade}
      />

      {/* ── Dashed parabolic trail (MAIN) — reveals left-to-right via
           clipPath. Plain `6 4` dasharray for the dashed look; the
           clipPath handles the reveal. ── */}
      {show_trail && arcPath ? (() => {
        const trailShimmer = shimmer(0);
        const { jx, jy } = jitter(0);
        return (
          <g clipPath="url(#bbTrailClip)">
            <path
              d={arcPath}
              fill="none"
              stroke="white"
              strokeWidth={2 * sc}
              strokeDasharray={`${6 * sc} ${4 * sc}`}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.85 * trailShimmer * floorFade}
              filter="url(#bbGlow)"
              transform={`translate(${jx}, ${jy})`}
            />
          </g>
        );
      })() : null}

      {/* ── Floor contact dots (subtle, supporting) — breath in groups ── */}
      {contactXs.map((cx, i) => {
        const breath = 0.55 + 0.22 * Math.sin(tSec * 0.9 - i * 0.18);
        const { jx, jy } = jitter(i + 10);
        const dotFade = fadeOpacity({
          framesSinceBeatStart: frame,
          fps,
          appear_s: (i / (contactXs.length - 1)) * (trailRevealDurMs / 1000),
          fadeMs: 300,
        });
        return (
          <circle
            key={`contact-${i}`}
            cx={cx + jx}
            cy={floorY + jy}
            r={2.5 * sc}
            fill="white"
            opacity={0.3 * breath * dotFade}
          />
        );
      })}

      {/* ── Peak height vertical tick lines (supporting) — breath ── */}
      {show_heights &&
        peaks.map((peak, i) => {
          const breath = 0.55 + 0.22 * Math.sin(tSec * 0.9 - i * 0.18);
          const { jx } = jitter(i + 20);
          const tickFade = fadeOpacity({
            framesSinceBeatStart: frame,
            fps,
            appear_s: labelAppearS[i],
            fadeMs: 350,
          });
          return (
            <line
              key={`tick-${i}`}
              x1={peak.x + jx}
              y1={floorY}
              x2={peak.x + jx}
              y2={peak.y}
              stroke="white"
              strokeWidth={1 * sc}
              strokeDasharray={`${3 * sc} ${4 * sc}`}
              strokeLinecap="round"
              opacity={Math.max(0.15, 0.35 - i * 0.04) * breath * tickFade}
            />
          );
        })}

      {/* ── Peak height labels — staggered fade-in as ball reaches each apex ── */}
      {show_heights &&
        labelData.map((lbl, i) => {
          const labelFade = fadeOpacity({
            framesSinceBeatStart: frame,
            fps,
            appear_s: labelAppearS[i],
            fadeMs: 200,
          });
          const sh = shimmer(i + 30);
          const { jx, jy } = jitter(i + 30);
          return (
            <text
              key={`label-${i}`}
              x={lbl.x + jx}
              y={lbl.y + jy}
              fill="white"
              fontSize={lbl.fontSize}
              fontFamily="ui-monospace, monospace"
              textAnchor="middle"
              dominantBaseline="auto"
              opacity={lbl.baseOpacity * labelFade * sh}
            >
              {lbl.label}
            </text>
          );
        })}

      {/* ── Wireframe basketball (MAIN) — animated position + rotation ── */}
      {/* Cyan contact-pulse halo underneath */}
      {cyanGlow > 0.01 && (
        <circle
          cx={ballX}
          cy={ballY}
          r={r * (1.4 + cyanGlow * 0.6)}
          fill="none"
          stroke={`rgba(0,255,255,${cyanGlow * 0.45})`}
          strokeWidth={3 * sc * cyanGlow}
          filter="url(#bbCyanGlow)"
        />
      )}

      <g
        filter="url(#bbBallGlow)"
        transform={`translate(${ballX}, ${ballY}) rotate(${rotationDeg})`}
      >
        {/* Outer circle */}
        <circle
          cx={0}
          cy={0}
          r={r}
          fill="none"
          stroke={ballStroke}
          strokeWidth={2.5 * sc}
          opacity={0.9 * shimmer(1)}
        />

        {/* Seam 1: vertical ellipse — rotates with ball */}
        <ellipse
          cx={0}
          cy={0}
          rx={r * 0.42}
          ry={r}
          fill="none"
          stroke="white"
          strokeWidth={1 * sc}
          opacity={0.5 * shimmer(2)}
        />

        {/* Seam 2: horizontal ellipse — rotates with ball */}
        <ellipse
          cx={0}
          cy={0}
          rx={r}
          ry={r * 0.42}
          fill="none"
          stroke="white"
          strokeWidth={1 * sc}
          opacity={0.5 * shimmer(3)}
        />
      </g>
    </svg>
  );
}
