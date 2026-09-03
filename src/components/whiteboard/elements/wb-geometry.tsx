"use client";

import { motion } from "framer-motion";
import type { GeometryAction, LocalPoint } from "@/types/whiteboard";
import { geometryFigureSchedule } from "../pen-tip";

type WbGeometryProps = {
  action: GeometryAction;
  x: number;
  y: number;
  width: number;
  height: number;
  progress: number;
  isAnimating: boolean;
  /**
   * Roaming-orb mode (?debug=orb). When true, figures draw SEQUENTIALLY (one
   * after another, proportional to stroke length) instead of all at once, so
   * the orb can act as the pen for each shape in turn. Off = unchanged
   * simultaneous reveal for every other surface.
   */
  penDraw?: boolean;
};

/** Map LocalPoint (0-100) to SVG coords within bounding box. */
function toSvg(p: LocalPoint, bx: number, by: number, bw: number, bh: number): [number, number] {
  return [bx + (p.x / 100) * bw, by + (p.y / 100) * bh];
}

export function WbGeometry({
  action,
  x,
  y,
  width,
  height,
  progress: progressProp,
  isAnimating: isAnimatingProp,
  penDraw = false,
}: WbGeometryProps) {
  // Sequential-draw schedule (orb mode only): one [start,end] progress slice
  // per figure, by stroke length. Matches the orb's pen-tip schedule exactly.
  const schedule =
    penDraw && isAnimatingProp
      ? geometryFigureSchedule(action.figures ?? [], { x, y, width, height })
      : null;
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Figures. Guard against a malformed geometry action (e.g. a model that
          authored its shapes under a different key) so it can never crash the
          whole lesson — it just renders nothing. */}
      {(action.figures ?? []).map((fig, i) => {
        // In sequential (orb) mode, remap the shared progress/isAnimating to
        // this figure's own slice so it draws only during its turn. These
        // shadow the props for every figure case below. Outside orb mode the
        // schedule is null and the originals pass through unchanged.
        let progress = progressProp;
        let isAnimating = isAnimatingProp;
        const seg = schedule?.[i];
        if (seg) {
          const local = (progressProp - seg.start) / Math.max(1e-6, seg.end - seg.start);
          progress = Math.max(0, Math.min(1, local));
          // Reveal in progress until this figure's slice is fully past; before
          // its slice it stays at progress 0 (dash-hidden).
          isAnimating = progressProp < seg.end;
        }
        switch (fig.type) {
          case "polygon": {
            const svgPts = fig.vertices.map((v) => toSvg(v, x, y, width, height));
            const pointsStr = svgPts.map(([px, py]) => `${px},${py}`).join(" ");
            const perimeter = svgPts.reduce((sum, pt, j) => {
              const next = svgPts[(j + 1) % svgPts.length];
              return sum + Math.sqrt((next[0] - pt[0]) ** 2 + (next[1] - pt[1]) ** 2);
            }, 0);

            return (
              <g key={`poly-${i}`}>
                <motion.polygon
                  points={pointsStr}
                  fill={fig.style?.fillColor ?? "rgba(59,130,246,0.08)"}
                  fillOpacity={penDraw && progress < 1 ? 0 : 1}
                  style={{
                    stroke: fig.style?.strokeColor ?? "var(--secondary-foreground)",
                    transition: "fill-opacity 0.4s ease",
                  }}
                  strokeWidth={fig.style?.strokeWidth ?? 2}
                  strokeLinejoin="round"
                  strokeDasharray={isAnimating ? perimeter : (fig.style?.dashed ? "6 4" : undefined)}
                  strokeDashoffset={isAnimating ? perimeter * (1 - progress) : 0}
                />
                {/* Vertex labels */}
                {fig.vertexLabels?.map((label, j) => {
                  if (!label || j >= svgPts.length) return null;
                  const [vx, vy] = svgPts[j];
                  // Offset label away from centroid
                  const cx = svgPts.reduce((s, p) => s + p[0], 0) / svgPts.length;
                  const cy = svgPts.reduce((s, p) => s + p[1], 0) / svgPts.length;
                  const dx = vx - cx;
                  const dy = vy - cy;
                  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                  const offsetX = (dx / dist) * 16;
                  const offsetY = (dy / dist) * 16;
                  return (
                    <text
                      key={`vl-${j}`}
                      x={vx + offsetX}
                      y={vy + offsetY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="14"
                      fontWeight="bold"
                      // Hold vertex labels until this shape closes (orb mode).
                      opacity={penDraw && progress < 1 ? 0 : 1}
                      style={{ fill: "var(--secondary-foreground)", transition: "opacity 0.35s ease" }}
                      fontFamily="system-ui, sans-serif"
                    >
                      {label}
                    </text>
                  );
                })}
              </g>
            );
          }

          case "circle": {
            const [cx, cy] = toSvg(fig.center, x, y, width, height);
            // Radius in local coords → SVG units (use width as reference)
            const r = (fig.radius / 100) * Math.min(width, height);
            const circumference = 2 * Math.PI * r;
            return (
              <motion.circle
                key={`circ-${i}`}
                cx={cx}
                cy={cy}
                r={r}
                fill={fig.style?.fillColor ?? "none"}
                fillOpacity={penDraw && progress < 1 ? 0 : 1}
                style={{
                  stroke: fig.style?.strokeColor ?? "var(--secondary-foreground)",
                  transition: "fill-opacity 0.4s ease",
                }}
                strokeWidth={fig.style?.strokeWidth ?? 2}
                strokeDasharray={isAnimating ? circumference : (fig.style?.dashed ? "6 4" : undefined)}
                strokeDashoffset={isAnimating ? circumference * (1 - progress) : 0}
              />
            );
          }

          case "ellipse": {
            const [ecx, ecy] = toSvg(fig.center, x, y, width, height);
            const erx = (fig.rx / 100) * width;
            const ery = (fig.ry / 100) * height;
            const circumference = 2 * Math.PI * Math.max(erx, ery);
            return (
              <motion.ellipse
                key={`ell-${i}`}
                cx={ecx}
                cy={ecy}
                rx={erx}
                ry={ery}
                fill={fig.style?.fillColor ?? "none"}
                fillOpacity={penDraw && progress < 1 ? 0 : 1}
                style={{
                  stroke: fig.style?.strokeColor ?? "var(--secondary-foreground)",
                  transition: "fill-opacity 0.4s ease",
                }}
                strokeWidth={fig.style?.strokeWidth ?? 2}
                strokeDasharray={isAnimating ? circumference : (fig.style?.dashed ? "6 4" : undefined)}
                strokeDashoffset={isAnimating ? circumference * (1 - progress) : 0}
              />
            );
          }

          case "line_segment": {
            const [x1, y1] = toSvg(fig.from, x, y, width, height);
            const [x2, y2] = toSvg(fig.to, x, y, width, height);
            const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
            return (
              <motion.line
                key={`seg-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                style={{ stroke: fig.style?.strokeColor ?? "var(--secondary-foreground)" }}
                strokeWidth={fig.style?.strokeWidth ?? 2}
                strokeDasharray={isAnimating ? len : (fig.style?.dashed ? "6 4" : undefined)}
                strokeDashoffset={isAnimating ? len * (1 - progress) : 0}
              />
            );
          }

          case "arrow": {
            const [ax1, ay1] = toSvg(fig.from, x, y, width, height);
            const [ax2, ay2] = toSvg(fig.to, x, y, width, height);
            const stroke = fig.style?.strokeColor ?? "var(--secondary-foreground)";
            const sw = fig.style?.strokeWidth ?? 2;
            const adx = ax2 - ax1;
            const ady = ay2 - ay1;
            const alen = Math.sqrt(adx * adx + ady * ady) || 1;
            const ux = adx / alen;
            const uy = ady / alen;
            // Perpendicular (for arrowhead width, label offset, and curve bow).
            const px = -uy;
            const py = ux;
            const headLen = 10;
            const headHalf = 5;
            // Pull the shaft back so it ends at the arrowhead base, not the tip.
            const hbx = ax2 - ux * headLen;
            const hby = ay2 - uy * headLen;
            const headPath = `M${ax2},${ay2} L${hbx + px * headHalf},${hby + py * headHalf} L${hbx - px * headHalf},${hby - py * headHalf} Z`;
            let shaftD: string;
            let shaftLen: number;
            if (fig.curved) {
              const mx = (ax1 + hbx) / 2;
              const my = (ay1 + hby) / 2;
              const bow = alen * 0.28;
              const cx = mx + px * bow;
              const cy = my + py * bow;
              shaftD = `M${ax1},${ay1} Q${cx},${cy} ${hbx},${hby}`;
              shaftLen = alen * 1.15; // approx for the draw-on dasharray
            } else {
              shaftD = `M${ax1},${ay1} L${hbx},${hby}`;
              shaftLen = Math.sqrt((hbx - ax1) ** 2 + (hby - ay1) ** 2);
            }
            const headVisible = !isAnimating || progress > 0.8;
            return (
              <g key={`arrow-${i}`}>
                <motion.path
                  d={shaftD}
                  fill="none"
                  style={{ stroke }}
                  strokeWidth={sw}
                  strokeLinecap="round"
                  strokeDasharray={isAnimating ? shaftLen : fig.style?.dashed ? "6 4" : undefined}
                  strokeDashoffset={isAnimating ? shaftLen * (1 - progress) : 0}
                />
                <path d={headPath} fill={stroke} opacity={headVisible ? 1 : 0} />
                {fig.label ? (
                  <text
                    x={(ax1 + ax2) / 2 + px * 13}
                    y={(ay1 + ay2) / 2 + py * 13}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="12"
                    style={{ fill: "var(--muted-foreground)" }}
                    fontFamily="system-ui, sans-serif"
                    opacity={headVisible ? 1 : 0}
                  >
                    {fig.label}
                  </text>
                ) : null}
              </g>
            );
          }

          case "labeled_box": {
            const [bcx, bcy] = toSvg(fig.center, x, y, width, height);
            const bw = (fig.width / 100) * width;
            const bh = (fig.height / 100) * height;
            const stroke = fig.style?.strokeColor ?? "var(--secondary-foreground)";
            const fill = fig.style?.fillColor ?? "rgba(59,130,246,0.06)";
            return (
              <motion.g
                key={`box-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <rect
                  x={bcx - bw / 2}
                  y={bcy - bh / 2}
                  width={bw}
                  height={bh}
                  rx={6}
                  fill={fill}
                  style={{ stroke }}
                  strokeWidth={fig.style?.strokeWidth ?? 2}
                  strokeDasharray={fig.style?.dashed ? "6 4" : undefined}
                />
                <text
                  x={bcx}
                  y={bcy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="13"
                  fontWeight="600"
                  style={{ fill: fig.textColor ?? "var(--secondary-foreground)" }}
                  fontFamily="system-ui, sans-serif"
                >
                  {fig.text}
                </text>
              </motion.g>
            );
          }

          default:
            return null;
        }
      })}

      {/* Annotations + labels — held until the shapes finish drawing so side
          labels, dimensions and angle marks don't appear over half-drawn
          figures (orb mode). Fades in once the step is fully drawn. */}
      <g
        opacity={penDraw && progressProp < 1 ? 0 : 1}
        style={{ transition: "opacity 0.4s ease" }}
      >
      {action.annotations?.map((ann, i) => {
        switch (ann.type) {
          case "right_angle": {
            const [vx, vy] = toSvg(ann.vertex, x, y, width, height);
            const s = ann.size ?? 12;
            // Find the two edges that meet at this vertex in the first polygon
            const poly = (action.figures ?? []).find(
              (f) => f.type === "polygon" && f.vertices.some(
                (v) => Math.abs(v.x - ann.vertex.x) < 1 && Math.abs(v.y - ann.vertex.y) < 1
              ),
            );
            let dx1 = 1, dy1 = 0, dx2 = 0, dy2 = -1; // default directions
            if (poly && poly.type === "polygon") {
              const verts = poly.vertices;
              const vi = verts.findIndex(
                (v) => Math.abs(v.x - ann.vertex.x) < 1 && Math.abs(v.y - ann.vertex.y) < 1
              );
              if (vi >= 0) {
                const prev = verts[(vi - 1 + verts.length) % verts.length];
                const next = verts[(vi + 1) % verts.length];
                const [pvx, pvy] = toSvg(prev, x, y, width, height);
                const [nvx, nvy] = toSvg(next, x, y, width, height);
                const d1 = Math.sqrt((pvx - vx) ** 2 + (pvy - vy) ** 2) || 1;
                const d2 = Math.sqrt((nvx - vx) ** 2 + (nvy - vy) ** 2) || 1;
                dx1 = (pvx - vx) / d1;
                dy1 = (pvy - vy) / d1;
                dx2 = (nvx - vx) / d2;
                dy2 = (nvy - vy) / d2;
              }
            }
            const p1x = vx + dx1 * s;
            const p1y = vy + dy1 * s;
            const p2x = vx + dx2 * s;
            const p2y = vy + dy2 * s;
            const cx2 = vx + (dx1 + dx2) * s;
            const cy2 = vy + (dy1 + dy2) * s;
            return (
              <g key={`ra-${i}`}>
                <path
                  d={`M${p1x},${p1y} L${cx2},${cy2} L${p2x},${p2y}`}
                  fill="none"
                  style={{ stroke: "var(--secondary-foreground)" }}
                  strokeWidth="1.5"
                />
              </g>
            );
          }

          case "dimension": {
            const [x1, y1] = toSvg(ann.from, x, y, width, height);
            const [x2, y2] = toSvg(ann.to, x, y, width, height);
            const offset = ann.offset ?? 16;
            // Perpendicular offset direction
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;
            const ox = nx * offset;
            const oy = ny * offset;
            return (
              <g key={`dim-${i}`}>
                <line
                  x1={x1 + ox}
                  y1={y1 + oy}
                  x2={x2 + ox}
                  y2={y2 + oy}
                  style={{ stroke: "var(--muted-foreground)" }}
                  strokeWidth="1"
                  markerStart="url(#dim-arrow-start)"
                  markerEnd="url(#dim-arrow-end)"
                />
                <text
                  x={(x1 + x2) / 2 + ox}
                  y={(y1 + y2) / 2 + oy - 4}
                  textAnchor="middle"
                  fontSize="12"
                  style={{ fill: "var(--secondary-foreground)" }}
                  fontFamily="system-ui, sans-serif"
                >
                  {ann.label}
                </text>
              </g>
            );
          }

          case "angle_arc": {
            const [vx, vy] = toSvg(ann.vertex, x, y, width, height);
            const [fx, fy] = toSvg(ann.from, x, y, width, height);
            const [tx, ty] = toSvg(ann.to, x, y, width, height);
            const r = 20;
            const fromAngle = Math.atan2(fy - vy, fx - vx);
            const toAngle = Math.atan2(ty - vy, tx - vx);
            const startX = vx + r * Math.cos(fromAngle);
            const startY = vy + r * Math.sin(fromAngle);
            const endX = vx + r * Math.cos(toAngle);
            const endY = vy + r * Math.sin(toAngle);
            // Determine sweep direction
            let sweep = toAngle - fromAngle;
            if (sweep < 0) sweep += 2 * Math.PI;
            const largeArc = sweep > Math.PI ? 1 : 0;
            return (
              <g key={`arc-${i}`}>
                <path
                  d={`M${startX},${startY} A${r},${r} 0 ${largeArc} 1 ${endX},${endY}`}
                  fill="none"
                  style={{ stroke: "var(--muted-foreground)" }}
                  strokeWidth="1"
                />
                {ann.label && (
                  <text
                    x={vx + (r + 8) * Math.cos((fromAngle + toAngle) / 2)}
                    y={vy + (r + 8) * Math.sin((fromAngle + toAngle) / 2)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="10"
                    style={{ fill: "var(--secondary-foreground)" }}
                    fontFamily="system-ui, sans-serif"
                  >
                    {ann.label}
                  </text>
                )}
              </g>
            );
          }

          case "tick_marks": {
            const [x1, y1] = toSvg(ann.from, x, y, width, height);
            const [x2, y2] = toSvg(ann.to, x, y, width, height);
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const tickLen = 6;
            const ticks = [];
            const count = ann.count;
            const spacing = 4;
            const start = -(count - 1) / 2;
            for (let j = 0; j < count; j++) {
              const offset = (start + j) * spacing;
              const cx2 = midX + (dx / len) * offset;
              const cy2 = midY + (dy / len) * offset;
              ticks.push(
                <line
                  key={j}
                  x1={cx2 + nx * tickLen}
                  y1={cy2 + ny * tickLen}
                  x2={cx2 - nx * tickLen}
                  y2={cy2 - ny * tickLen}
                  style={{ stroke: "var(--secondary-foreground)" }}
                  strokeWidth="1.5"
                />,
              );
            }
            return <g key={`tk-${i}`}>{ticks}</g>;
          }

          default:
            return null;
        }
      })}

      {/* Labels */}
      {action.labels?.map((lbl, i) => {
        const [lx, ly] = toSvg(lbl.position, x, y, width, height);
        return (
          <text
            key={`lbl-${i}`}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={lbl.fontSize ?? 12}
            style={{ fill: "var(--secondary-foreground)" }}
            fontFamily="system-ui, sans-serif"
          >
            {lbl.text}
          </text>
        );
      })}
      </g>

      {/* Shared marker defs for dimension arrows */}
      <defs>
        <marker id="dim-arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M 10 0 L 0 5 L 10 10 z" style={{ fill: "var(--muted-foreground)" }} />
        </marker>
        <marker id="dim-arrow-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: "var(--muted-foreground)" }} />
        </marker>
      </defs>
    </motion.g>
  );
}
