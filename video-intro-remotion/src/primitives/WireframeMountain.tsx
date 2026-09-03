import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";

/**
 * SVG wireframe mountain — particle/mesh aesthetic in white on transparent.
 *
 * The mesh itself is alive: every particle shimmers in brightness, jitters
 * subtly in position, and ridge rows pulse with a slow wave travelling
 * across the terrain. On top of that the camera (zoom/yaw/pitch) animates
 * over the beat. For establish beats the peak grows out of a flat plain;
 * for the orbit reveal the secondary peak emerges as the camera reaches it.
 * `particle_flow_up` releases ascending light streaks up the slope.
 */
export function WireframeMountain({
  peak_height = 0.85,
  peak_sharpness = 0.7,
  secondary_peak_height,
  camera = "slow_push_in",
  show_both = false,
  particle_flow_up = false,
  beatDurationFrames,
}: {
  peak_height?: number;
  peak_sharpness?: number;
  secondary_peak_height?: number;
  camera?: "slow_push_in" | "continued_push_in" | "orbit_right";
  show_grid_floor?: boolean;
  show_both?: boolean;
  particle_flow_up?: boolean;
  beatDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const tSec = frame / fps;
  // t is beat-relative fraction 0..1.
  const t = frame / beatDurationFrames;

  // Camera params evolve over the beat.
  let zoom: number;
  let yawDeg: number;
  let pitchDeg: number;
  let orbitProgress = 0;
  switch (camera) {
    case "continued_push_in":
      zoom = interpolate(t, [0, 1], [1.2, 1.6], { extrapolateRight: "clamp" });
      yawDeg = 0;
      pitchDeg = 22;
      break;
    case "orbit_right":
      orbitProgress = interpolate(t, [0, 1], [0, 1], {
        easing: Easing.inOut(Easing.cubic),
        extrapolateRight: "clamp",
      });
      zoom = 1.3;
      yawDeg = orbitProgress * 28;
      pitchDeg = 22;
      break;
    case "slow_push_in":
    default:
      zoom = interpolate(t, [0, 1], [1.0, 1.2], { extrapolateRight: "clamp" });
      yawDeg = 0;
      pitchDeg = 24;
      break;
  }

  // Peak grow-in: on establish, the primary peak rises from flat over the
  // first 700ms so the terrain feels like it's forming, not posed.
  const primaryGrow =
    camera === "slow_push_in"
      ? interpolate(tSec, [0, 0.7], [0, 1], {
          easing: Easing.out(Easing.cubic),
          extrapolateRight: "clamp",
        })
      : 1;
  // Secondary peak reveal: sync to the orbit so the second peak emerges as
  // the camera arrives. For non-orbit beats the secondary stays at full height.
  const secondaryGrow =
    camera === "orbit_right"
      ? interpolate(orbitProgress, [0.15, 0.7], [0, 1], {
          easing: Easing.out(Easing.cubic),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  // Grid resolution. Denser = closer to Veo's brightness.
  const COLS = 96;
  const ROWS = 56;

  // Terrain bounds in world units.
  const xMin = -1.6;
  const xMax = 1.6;
  const zMin = -1.2;
  const zMax = 1.2;

  // Peak centers — primary at center-left, secondary (gentler) at right when show_both.
  const peaks: Array<{ cx: number; cz: number; amp: number; sigma: number }> = [
    {
      cx: show_both ? -0.7 : 0.0,
      cz: 0.1,
      amp: peak_height * primaryGrow,
      sigma: 0.18 + (1 - peak_sharpness) * 0.35,
    },
  ];
  if (show_both) {
    peaks.push({
      cx: 0.8,
      cz: 0.0,
      amp: (secondary_peak_height ?? peak_height * 0.4) * secondaryGrow,
      sigma: 0.5,
    });
  }

  const heightAt = (x: number, z: number): number => {
    let h = 0;
    for (const p of peaks) {
      const dx = x - p.cx;
      const dz = z - p.cz;
      const d2 = dx * dx + dz * dz;
      h += p.amp * Math.exp(-d2 / (2 * p.sigma * p.sigma));
    }
    h += 0.04 * Math.sin(x * 3.2) * Math.cos(z * 2.7);
    return h;
  };

  // Projection setup.
  const yawRad = (yawDeg * Math.PI) / 180;
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const cy = Math.cos(yawRad);
  const sy = Math.sin(yawRad);
  const cp = Math.cos(pitchRad);
  const sp = Math.sin(pitchRad);
  const cx0 = width / 2;
  const cy0 = height / 2 + 60;
  const scale = (Math.min(width, height) / 3.2) * zoom;

  const project = (x: number, y: number, z: number) => {
    const x1 = cy * x + sy * z;
    const z1 = -sy * x + cy * z;
    const y1 = cp * y - sp * z1;
    const z2 = sp * y + cp * z1;
    const sX = cx0 + scale * x1;
    const sY = cy0 - scale * y1 - scale * z2 * 0.15;
    return [sX, sY] as const;
  };

  // Build particles + sparse ridge polylines. Each particle gets a per-frame
  // brightness shimmer + tiny xy jitter so the mesh feels alive.
  const points: Array<{ x: number; y: number; b: number }> = [];
  const ridgeRows: Array<{ d: string; rowIdx: number }> = [];

  let idx = 0;
  for (let r = 0; r < ROWS; r++) {
    const zNorm = r / (ROWS - 1);
    const z = zMin + zNorm * (zMax - zMin);
    let path = "";
    for (let c = 0; c < COLS; c++) {
      const xNorm = c / (COLS - 1);
      const x = xMin + xNorm * (xMax - xMin);
      const y = heightAt(x, z);
      const [sX, sY] = project(x, y, z);
      // Distance fade — further = dimmer base.
      const dist = Math.sqrt(x * x + (z + 1) * (z + 1));
      const distB = Math.max(0.18, 1 - dist * 0.25);
      // Per-particle shimmer: 0.85..1.15 multiplier, slow sin keyed by index.
      const shimmer = 0.85 + 0.15 * Math.sin(tSec * 1.8 + idx * 0.31);
      // Per-particle xy jitter — sub-pixel, gives the mesh organic noise.
      const jx = Math.cos(idx * 1.7 + tSec * 1.3) * 0.5;
      const jy = Math.sin(idx * 0.9 + tSec * 0.8) * 0.5;
      points.push({
        x: sX + jx,
        y: sY + jy,
        b: Math.min(1, distB * shimmer),
      });
      path += c === 0 ? `M ${sX} ${sY}` : ` L ${sX} ${sY}`;
      idx++;
    }
    if (r % 3 === 0) ridgeRows.push({ d: path, rowIdx: r });
  }

  // particle_flow_up: ascending streaks climbing the slope. Sampled around
  // the primary peak so they read as "climbing the mountain".
  const ASCEND_PERIOD_S = 2.8;
  const ASCEND_STREAMS = particle_flow_up ? 70 : 0;
  const ascenders: Array<{ x: number; y: number; opacity: number }> = [];
  if (ASCEND_STREAMS > 0) {
    const primary = peaks[0];
    for (let s = 0; s < ASCEND_STREAMS; s++) {
      // Distribute streams around the peak using a golden-angle spiral.
      const angle = s * 2.39996;
      const ringR = 0.18 + (s % 9) * 0.08;
      const sxw = primary.cx + Math.cos(angle) * ringR;
      const szw = primary.cz + Math.sin(angle) * ringR * 0.7;
      const phase = (s / ASCEND_STREAMS) + s * 0.137;
      const cycle = ((tSec / ASCEND_PERIOD_S) + phase) % 1;
      // Local terrain height at this stream's (x, z) — caps the rise so
      // streams trace the actual slope.
      const localPeak = heightAt(sxw, szw);
      const climbY = cycle * Math.max(localPeak, 0.15) * 1.15;
      // Fade in/out near cycle boundaries.
      let opacity = 1;
      if (cycle < 0.18) opacity = cycle / 0.18;
      else if (cycle > 0.78) opacity = Math.max(0, (1 - cycle) / 0.22);
      const [aX, aY] = project(sxw, climbY, szw);
      ascenders.push({ x: aX, y: aY, opacity });
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
        <filter id="particleGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter
          id="ascenderGlow"
          x="-100%"
          y="-100%"
          width="300%"
          height="300%"
        >
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Ridge polylines — brightness wave travels across rows so they pulse. */}
      {ridgeRows.map((row, i) => {
        const wave = 0.55 + 0.25 * Math.sin(tSec * 0.9 - row.rowIdx * 0.18);
        return (
          <path
            key={i}
            d={row.d}
            fill="none"
            stroke="white"
            strokeOpacity={wave}
            strokeWidth={1.0}
          />
        );
      })}
      {/* Particles */}
      <g filter="url(#particleGlow)">
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={1.6}
            fill="white"
            fillOpacity={Math.min(1, p.b * 1.05)}
          />
        ))}
      </g>
      {/* Ascending light streaks — climb the slope. */}
      {ascenders.length > 0 ? (
        <g filter="url(#ascenderGlow)">
          {ascenders.map((a, i) => (
            <circle
              key={i}
              cx={a.x}
              cy={a.y}
              r={2.4}
              fill="white"
              fillOpacity={a.opacity}
            />
          ))}
        </g>
      ) : null}
    </svg>
  );
}
