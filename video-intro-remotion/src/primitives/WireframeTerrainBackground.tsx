import { useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Living wireframe terrain — used as a persistent backdrop behind beats that
 * draw thin foreground elements (axes, triangles, callouts).
 *
 * Fixed dual-peak composition; the mesh itself shimmers + jitters + has a
 * brightness wave travelling across ridge rows so the canvas never feels
 * frozen during foreground reveals. Density is matched to WireframeMountain
 * so brightness stays consistent across the whole video.
 */
export function WireframeTerrainBackground({
  opacity = 0.6,
}: {
  opacity?: number;
}) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const tSec = frame / fps;

  const COLS = 96;
  const ROWS = 56;
  const xMin = -1.6;
  const xMax = 1.6;
  const zMin = -1.2;
  const zMax = 1.2;

  const peaks = [
    { cx: -0.7, cz: 0.1, amp: 0.85, sigma: 0.28 },
    { cx: 0.8, cz: 0.0, amp: 0.4, sigma: 0.5 },
  ];

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

  // Fixed projection — same as WireframeMountain "slow_push_in" mid-state.
  const yawDeg = 0;
  const pitchDeg = 24;
  const zoom = 1.1;
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
      const dist = Math.sqrt(x * x + (z + 1) * (z + 1));
      const distB = Math.max(0.18, 1 - dist * 0.25);
      const shimmer = 0.85 + 0.15 * Math.sin(tSec * 1.8 + idx * 0.31);
      const jx = Math.cos(idx * 1.7 + tSec * 1.3) * 0.4;
      const jy = Math.sin(idx * 0.9 + tSec * 0.8) * 0.4;
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

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{
        position: "absolute",
        inset: 0,
        opacity,
      }}
    >
      <defs>
        <filter id="bgGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {ridgeRows.map((row, i) => {
        const wave = 0.55 + 0.22 * Math.sin(tSec * 0.9 - row.rowIdx * 0.18);
        return (
          <path
            key={i}
            d={row.d}
            fill="none"
            stroke="white"
            strokeOpacity={wave}
            strokeWidth={1.1}
          />
        );
      })}
      <g filter="url(#bgGlow)">
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={1.7}
            fill="white"
            fillOpacity={Math.min(1, p.b * 1.05)}
          />
        ))}
      </g>
    </svg>
  );
}
