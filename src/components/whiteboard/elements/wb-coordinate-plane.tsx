"use client";

import { useId, useMemo } from "react";
import { motion } from "framer-motion";
import type { CoordElement, CoordinatePlaneAction } from "@/types/whiteboard";
import { adaptWbColor, useIsDarkMode } from "../wb-color";
import { relaxLabels, type LabelSeed, type StrokeSegment } from "./coord-plane-label-relax";

type Vec = { x: number; y: number };

type WbCoordinatePlaneProps = {
  action: CoordinatePlaneAction;
  x: number;
  y: number;
  width: number;
  height: number;
  progress: number;
  isAnimating: boolean;
  equalScale?: boolean;
};

const PADDING = 40;

/** Read a 2D coordinate from a model-authored coord element regardless
 *  of which field-name convention it used. The canonical field is `at`,
 *  but we also accept `coords` and the `{x, y}` scalar form because the
 *  generator regularly guesses one of these. Returns null if no usable
 *  pair can be extracted. Used by both `point` rendering and any other
 *  element that carries a single point.
 */
function _readPoint(elem: unknown): [number, number] | null {
  const e = elem as Record<string, unknown>;
  const tryPair = (v: unknown): [number, number] | null => {
    if (Array.isArray(v) && v.length >= 2 && typeof v[0] === "number" && typeof v[1] === "number") {
      return [v[0], v[1]];
    }
    return null;
  };
  return (
    tryPair(e.at) ??
    tryPair(e.coords) ??
    tryPair(e.point) ??
    tryPair(e.position) ??
    (typeof e.x === "number" && typeof e.y === "number" ? [e.x, e.y] : null)
  );
}

/** Same flexibility for `from`/`to` line endpoints. */
function _readEndpoints(elem: unknown): { from: [number, number]; to: [number, number] } | null {
  const e = elem as Record<string, unknown>;
  const get = (key: string): [number, number] | null => {
    const v = e[key];
    if (Array.isArray(v) && v.length >= 2 && typeof v[0] === "number" && typeof v[1] === "number") {
      return [v[0], v[1]];
    }
    return null;
  };
  const from = get("from") ?? get("start") ?? get("a");
  const to = get("to") ?? get("end") ?? get("b");
  if (from && to) return { from, to };
  return null;
}

const PLACEMENT_DIR: Record<"ne" | "nw" | "se" | "sw", Vec> = {
  ne: { x: 0.85, y: -0.55 },
  nw: { x: -0.85, y: -0.55 },
  se: { x: 0.85, y: 0.55 },
  sw: { x: -0.85, y: 0.55 },
};

/** Distance to the plot bounds when traveling from (px, py) along dir. */
function directionRoom(px: number, py: number, dir: Vec, bx: number, by: number, bw: number, bh: number): number {
  const tx = dir.x > 0 ? (bx + bw - px) / dir.x : dir.x < 0 ? (bx - px) / dir.x : Infinity;
  const ty = dir.y > 0 ? (by + bh - py) / dir.y : dir.y < 0 ? (by - py) / dir.y : Infinity;
  return Math.min(tx, ty);
}

/** First positive ray-segment intersection parameter, or null. */
function raySegIntersect(px: number, py: number, dir: Vec, ax: number, ay: number, bsx: number, bsy: number): number | null {
  const sdx = bsx - ax;
  const sdy = bsy - ay;
  const denom = sdx * dir.y - sdy * dir.x;
  if (Math.abs(denom) < 1e-9) return null;
  const dx = ax - px;
  const dy = ay - py;
  const t = (sdx * dy - sdy * dx) / denom;
  const s = (dir.x * dy - dir.y * dx) / denom;
  if (t > 0.5 && s >= 0 && s <= 1) return t;
  return null;
}

/** Distance from (px, py) along `dir` before hitting any obstacle: plot bounds,
 *  the implicit x/y axes, or any line/segment in `elements`. The line we are
 *  perpendicular TO is excluded so we don't count "the line itself" as an
 *  obstacle blocking us at distance 0. */
function obstacleRoom(
  px: number, py: number, dir: Vec,
  passingThrough: CoordElement | null,
  elements: readonly CoordElement[],
  xMin: number, xMax: number, yMin: number, yMax: number,
  bx: number, by: number, bw: number, bh: number,
): number {
  let t = directionRoom(px, py, dir, bx, by, bw, bh);
  const considerSegment = (a: [number, number], b: [number, number]) => {
    const [ax, ay] = dataToSvg(a[0], a[1], xMin, xMax, yMin, yMax, bx, by, bw, bh);
    const [bsx, bsy] = dataToSvg(b[0], b[1], xMin, xMax, yMin, yMax, bx, by, bw, bh);
    const hit = raySegIntersect(px, py, dir, ax, ay, bsx, bsy);
    if (hit != null && hit < t) t = hit;
  };
  // Implicit axes whenever the origin falls inside the plot range.
  if (yMin <= 0 && yMax >= 0) considerSegment([xMin, 0], [xMax, 0]);
  if (xMin <= 0 && xMax >= 0) considerSegment([0, yMin], [0, yMax]);
  for (const el of elements) {
    if (el === passingThrough) continue;
    if (el.type === "line") considerSegment(el.from, el.to);
    else if (el.type === "horizontal_line") considerSegment([xMin, el.y], [xMax, el.y]);
    else if (el.type === "vertical_line") considerSegment([el.x, yMin], [el.x, yMax]);
  }
  return t;
}

/** Default direction based purely on plot bounds room. */
function autoCornerDir(px: number, py: number, bx: number, by: number, bw: number, bh: number): Vec {
  const horiz = bx + bw - px >= px - bx ? "e" : "w";
  const vert = py - by >= by + bh - py ? "n" : "s";
  return PLACEMENT_DIR[`${vert}${horiz}` as keyof typeof PLACEMENT_DIR];
}

/** Convert a data-space tangent direction (dx, dy in plot units) into an
 *  SVG-space unit vector, accounting for the y-axis flip and per-axis
 *  scale. Lets us reason about "perpendicular to this line" in the same
 *  pixel space we draw the leader in. */
function dataDirToSvg(dx: number, dy: number, xMin: number, xMax: number, yMin: number, yMax: number, bw: number, bh: number): Vec {
  const sx = dx * (bw - 2 * PADDING) / (xMax - xMin);
  const sy = -dy * (bh - 2 * PADDING) / (yMax - yMin);
  const len = Math.hypot(sx, sy) || 1;
  return { x: sx / len, y: sy / len };
}

const ON_SEGMENT_EPS = 0.05;

function pointOnSegment(at: [number, number], from: [number, number], to: [number, number]): boolean {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return false;
  const t = ((at[0] - from[0]) * dx + (at[1] - from[1]) * dy) / len2;
  if (t < -ON_SEGMENT_EPS || t > 1 + ON_SEGMENT_EPS) return false;
  const projX = from[0] + t * dx;
  const projY = from[1] + t * dy;
  return Math.hypot(at[0] - projX, at[1] - projY) <= 0.1 * Math.hypot(dx, dy);
}

/** Find a tangent direction for any line/function/axis-line passing through
 *  the given point. Returned vector lives in SVG space (pixels) so the caller
 *  can rotate it 90° to get a perpendicular leader direction. The matched
 *  element is returned alongside so the caller can exclude it from obstacle
 *  scoring (we don't want the line we're perpendicular to to count as an
 *  obstacle blocking us at distance 0). */
function findLocalTangent(
  at: [number, number],
  elements: readonly CoordElement[],
  xMin: number, xMax: number, yMin: number, yMax: number, bw: number, bh: number,
): { dir: Vec; el: CoordElement } | null {
  for (const el of elements) {
    if (el.type === "line") {
      if (pointOnSegment(at, el.from, el.to)) {
        return { dir: dataDirToSvg(el.to[0] - el.from[0], el.to[1] - el.from[1], xMin, xMax, yMin, yMax, bw, bh), el };
      }
    } else if (el.type === "function") {
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < el.points.length; i++) {
        const [x, y] = el.points[i];
        const d = Math.hypot(x - at[0], y - at[1]);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      if (bestIdx >= 0 && bestDist <= 0.5) {
        const prev = el.points[Math.max(0, bestIdx - 1)];
        const next = el.points[Math.min(el.points.length - 1, bestIdx + 1)];
        return { dir: dataDirToSvg(next[0] - prev[0], next[1] - prev[1], xMin, xMax, yMin, yMax, bw, bh), el };
      }
    } else if (el.type === "vertical_line" && Math.abs(el.x - at[0]) < 0.05) {
      return { dir: dataDirToSvg(0, 1, xMin, xMax, yMin, yMax, bw, bh), el };
    } else if (el.type === "horizontal_line" && Math.abs(el.y - at[1]) < 0.05) {
      return { dir: dataDirToSvg(1, 0, xMin, xMax, yMin, yMax, bw, bh), el };
    }
  }
  return null;
}

/** Penalty applied to a candidate direction whose label tip would land
 *  outside the plane's bounding box. Without this, `obstacleRoom` would
 *  pick a direction with "lots of room past the plot edge" — but the
 *  label's text extends past the leader and clips off the SVG viewport.
 *  We project a notional label-tip point (leader + forward extent) and
 *  charge a per-pixel penalty for each axis it overshoots the box. */
function edgeOvershootPenalty(
  px: number, py: number, dir: Vec,
  leaderLen: number, forwardExtent: number,
  bx: number, by: number, bw: number, bh: number,
): number {
  const tipX = px + dir.x * (leaderLen + forwardExtent);
  const tipY = py + dir.y * leaderLen;
  let p = 0;
  if (tipX < bx) p += (bx - tipX) * 4;
  if (tipX > bx + bw) p += (tipX - (bx + bw)) * 4;
  if (tipY < by) p += (by - tipY) * 4;
  if (tipY > by + bh) p += (tipY - (by + bh)) * 4;
  return p;
}

/** Pick the best leader/label direction. Two-pass:
 *
 *  PASS 1 — 16-way coarse search (every 22.5°). Hard-excludes any
 *  candidate within ~22° of the line tangent (`|dot| > 0.92`) so a
 *  leader never visually runs along the geometry it's annotating.
 *  Scores each candidate as `obstacleRoom - edgeOvershootPenalty`.
 *
 *  PASS 2 — boundary refinement. If the pass-1 winner sits right at
 *  the exclusion boundary (within ~32° of the tangent), the
 *  optimal angle may actually lie INSIDE the exclusion zone — the
 *  hard cutoff just barely wins out over a near-tangent angle that
 *  has more clear room or no edge overshoot. Sweep 1° at a time
 *  from the winner toward the tangent for 10 steps with a SOFT
 *  alignment penalty (zero at the boundary, growing as we approach
 *  full tangent alignment). If any refined candidate beats the
 *  pass-1 winner, take it. */
function chooseAnnotationDir(
  px: number, py: number,
  passingThrough: CoordElement | null,
  tangent: Vec | null,
  leaderLen: number, forwardExtent: number,
  elements: readonly CoordElement[],
  xMin: number, xMax: number, yMin: number, yMax: number,
  bx: number, by: number, bw: number, bh: number,
): Vec {
  const score = (dir: Vec, alignPenalty: number) =>
    obstacleRoom(px, py, dir, passingThrough, elements, xMin, xMax, yMin, yMax, bx, by, bw, bh)
    - edgeOvershootPenalty(px, py, dir, leaderLen, forwardExtent, bx, by, bw, bh)
    - alignPenalty;

  let best: Vec = { x: 0, y: -1 };
  let bestScore = -Infinity;
  let bestAngle = 0;
  let bestDot = 0;

  // PASS 1: 16-way coarse with hard exclusion.
  const STEPS = 16;
  for (let i = 0; i < STEPS; i++) {
    const angle = (i * Math.PI * 2) / STEPS;
    const dir: Vec = { x: Math.cos(angle), y: Math.sin(angle) };
    let dot = 0;
    if (tangent) {
      dot = Math.abs(dir.x * tangent.x + dir.y * tangent.y);
      if (dot > 0.92) continue; // ~22° hard exclusion
    }
    const s = score(dir, 0);
    if (s > bestScore) {
      bestScore = s;
      best = dir;
      bestAngle = angle;
      bestDot = dot;
    }
  }

  // PASS 2: if winner sits near the tangent boundary, refine into
  // the exclusion zone at 1° increments. cos(32°) ≈ 0.85, so a dot
  // > 0.85 means the pass-1 winner is on the candidate adjacent to
  // exclusion — exactly the case where a few degrees more might
  // score better despite the soft alignment cost.
  if (tangent && bestDot > 0.85) {
    // Sweep both 1°→10° AWAY from current bestAngle in BOTH
    // directions; one side moves into the exclusion zone (toward
    // tangent), the other away. The penalty function naturally
    // selects the in-zone refinement when it improves the score.
    const DEG = Math.PI / 180;
    for (let step = 1; step <= 10; step++) {
      for (const sign of [1, -1] as const) {
        const angle = bestAngle + sign * step * DEG;
        const dir: Vec = { x: Math.cos(angle), y: Math.sin(angle) };
        const dot = Math.abs(dir.x * tangent.x + dir.y * tangent.y);
        // Soft alignment penalty: 0 at the boundary (dot=0.92),
        // grows as we approach pure tangent alignment (dot=1).
        // Tuned so a 5° refinement (dot ≈ 0.95) costs ~6 units —
        // beats minor edge overshoots but keeps the leader visibly
        // distinct from the line.
        // Steep alignment penalty inside the exclusion zone — soft
        // enough that a clear-room win can still beat the boundary,
        // but stiff enough that we don't pick angles 1-5° from the
        // tangent just because they have marginally better
        // obstacleRoom. Without this, line labels end up
        // almost-parallel to the line and visibly overlap it.
        const align = dot > 0.92 ? (dot - 0.92) * 200 : 0;
        const s = score(dir, align);
        if (s > bestScore) {
          bestScore = s;
          best = dir;
        }
      }
    }
  }

  return best;
}

/** Pick a leader direction for a point note. Considers 16 candidate
 *  angles, excludes directions aligned with any line passing through
 *  the point, and penalizes directions whose label would clip off the
 *  plane's bounding box. */
function autoPointDir(
  at: [number, number],
  px: number, py: number,
  elements: readonly CoordElement[],
  xMin: number, xMax: number, yMin: number, yMax: number,
  bx: number, by: number, bw: number, bh: number,
): Vec {
  const tangent = findLocalTangent(at, elements, xMin, xMax, yMin, yMax, bw, bh);
  return chooseAnnotationDir(
    px, py,
    tangent?.el ?? null,
    tangent?.dir ?? null,
    56, // leaderLen — matches the 56 used in the point render
    100, // forwardExtent — approximate label width past leader
    elements, xMin, xMax, yMin, yMax, bx, by, bw, bh,
  );
}

/** Liang-Barsky segment-vs-rect clip in SVG space. Returns the
 *  visible portion of a segment inside the plot rectangle, or null if
 *  the segment lies entirely outside. Used for `line` elements so
 *  the stroke-dasharray reveal animates over the visible portion of
 *  the line, not the (potentially huge) raw author-supplied
 *  endpoints. The SVG `<clipPath>` on the parent group still catches
 *  any sub-pixel slop, but pre-clipping the geometry makes the
 *  animation read cleanly when an author chose endpoints far outside
 *  the plot range to draw a "line of slope m". */
function clipSegmentToRect(
  x1: number, y1: number, x2: number, y2: number,
  rx: number, ry: number, rw: number, rh: number,
): { x1: number; y1: number; x2: number; y2: number } | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const xMin = rx;
  const xMax = rx + rw;
  const yMin = ry;
  const yMax = ry + rh;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - xMin, xMax - x1, y1 - yMin, yMax - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return {
    x1: x1 + t0 * dx,
    y1: y1 + t0 * dy,
    x2: x1 + t1 * dx,
    y2: y1 + t1 * dy,
  };
}

/** Map data coordinates to SVG coordinates within the bounding box. */
function dataToSvg(
  dataX: number,
  dataY: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): [number, number] {
  const sx = bx + PADDING + ((dataX - xMin) / (xMax - xMin)) * (bw - 2 * PADDING);
  const sy = by + PADDING + ((yMax - dataY) / (yMax - yMin)) * (bh - 2 * PADDING);
  return [sx, sy];
}

/** Catmull-Rom to cubic Bezier control points. */
function catmullRomToBezier(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
): { cp1: [number, number]; cp2: [number, number] } {
  return {
    cp1: [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
    cp2: [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
  };
}

/** Detect whether a sample set is "approximately linear" — meaning a straight
 *  line explains the data well enough to prefer it over Catmull-Rom smoothing.
 *
 *  AI-authored `function` elements for linear equations sometimes emit one
 *  noisy endpoint that pulls the spline into a visible curve at the extremes
 *  (e.g., `3x + 2y = 12` with a first point (-0.5, 7.75) that should be 6.75).
 *  Catmull-Rom's endpoint clamping amplifies that error.
 *
 *  Strategy: fit a total-least-squares line, sort orthogonal residuals, and
 *  accept the set as linear if the 2nd-largest residual is within `epsilonPx`
 *  — i.e. at most one point can be an outlier. When accepted, the caller
 *  should render a single line segment using the returned fit, which ignores
 *  the outlier rather than passing through it. */
type LinearFit = {
  /** Line passes through (mx, my) with unit direction (dirX, dirY). */
  mx: number;
  my: number;
  dirX: number;
  dirY: number;
};

function tlsFit(pts: [number, number][]): LinearFit {
  const n = pts.length;
  let sumX = 0, sumY = 0;
  for (const [x, y] of pts) { sumX += x; sumY += y; }
  const mx = sumX / n;
  const my = sumY / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of pts) {
    const dx = x - mx;
    const dy = y - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { mx, my, dirX: Math.cos(theta), dirY: Math.sin(theta) };
}

function perpDistance(fit: LinearFit, x: number, y: number): number {
  return Math.abs(-fit.dirY * (x - fit.mx) + fit.dirX * (y - fit.my));
}

function fitLineIfLinear(
  pts: [number, number][],
  epsilonPx = 3,
): LinearFit | null {
  if (pts.length < 3) return null;
  // A single bad endpoint skews TLS enough to inflate the other residuals,
  // so iteratively drop the worst point (up to 25% of the set) and refit
  // until the remaining points all lie within epsilonPx of the line.
  const maxOutliers = Math.max(1, Math.floor(pts.length / 4));
  let active = pts.slice();
  for (let trimmed = 0; trimmed <= maxOutliers; trimmed++) {
    if (active.length < 3) return null;
    const fit = tlsFit(active);
    let worstIdx = -1;
    let worstDist = 0;
    for (let i = 0; i < active.length; i++) {
      const d = perpDistance(fit, active[i][0], active[i][1]);
      if (d > worstDist) { worstDist = d; worstIdx = i; }
    }
    if (worstDist <= epsilonPx) return fit;
    active = active.filter((_, i) => i !== worstIdx);
  }
  return null;
}

/** Project a point onto the fit line, returning signed distance along dir. */
function projectOnto(fit: LinearFit, x: number, y: number): number {
  return fit.dirX * (x - fit.mx) + fit.dirY * (y - fit.my);
}

/** Build a smooth SVG path string from data points via Catmull-Rom interpolation. */
function buildSmoothPath(
  dataPoints: [number, number][],
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): string {
  if (dataPoints.length < 2) return "";

  const pts = dataPoints.map(([dx, dy]) => dataToSvg(dx, dy, xMin, xMax, yMin, yMax, bx, by, bw, bh));

  if (pts.length === 2) {
    return `M${pts[0][0]},${pts[0][1]} L${pts[1][0]},${pts[1][1]}`;
  }

  // If the samples are approximately linear (with at most one outlier),
  // render a single straight segment along the best-fit line. Prevents
  // Catmull-Rom's endpoint-clamping from bending a linear function into
  // a curve at the extremes, and corrects for AI-authored outlier endpoints.
  const fit = fitLineIfLinear(pts);
  if (fit) {
    let tMin = Infinity, tMax = -Infinity;
    for (const [x, y] of pts) {
      const t = projectOnto(fit, x, y);
      if (t < tMin) tMin = t;
      if (t > tMax) tMax = t;
    }
    const x1 = fit.mx + fit.dirX * tMin;
    const y1 = fit.my + fit.dirY * tMin;
    const x2 = fit.mx + fit.dirX * tMax;
    const y2 = fit.my + fit.dirY * tMax;
    return `M${x1},${y1} L${x2},${y2}`;
  }

  let d = `M${pts[0][0]},${pts[0][1]}`;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const { cp1, cp2 } = catmullRomToBezier(p0, p1, p2, p3);
    d += ` C${cp1[0]},${cp1[1]} ${cp2[0]},${cp2[1]} ${p2[0]},${p2[1]}`;
  }

  return d;
}

export function WbCoordinatePlane({
  action,
  x,
  y,
  width,
  height,
  progress,
  isAnimating,
  equalScale,
}: WbCoordinatePlaneProps) {
  const isDark = useIsDarkMode();
  const reactId = useId();
  const clipId = `coord-plot-clip-${reactId.replace(/:/g, "-")}`;
  const [xMin, xMax] = action.xRange;
  const [yMin, yMax] = action.yRange;
  const showGrid = action.showGrid !== false;

  // When equalScale is enabled, enforce equal px-per-unit on both axes
  // Otherwise use the raw bounding box (original behavior)
  let bx = x, by = y, bw = width, bh = height;
  if (equalScale) {
    const xSpan = (xMax - xMin) || 1;
    const ySpan = (yMax - yMin) || 1;
    const pw = width - 2 * PADDING;
    const ph = height - 2 * PADDING;
    const s = Math.min(pw / xSpan, ph / ySpan);
    const ew = xSpan * s;
    const eh = ySpan * s;
    bx = x + (pw - ew) / 2;
    by = y + (ph - eh) / 2;
    bw = ew + 2 * PADDING;
    bh = eh + 2 * PADDING;
  }

  // Compute tick values with smart intervals
  function niceTickInterval(rangeMin: number, rangeMax: number): number {
    const span = rangeMax - rangeMin;
    if (span <= 0) return 1;
    // Target roughly 8-12 ticks
    const rough = span / 10;
    // Round to a "nice" number: 1, 2, 5, 10, 20, 25, 50, ...
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const residual = rough / mag;
    let nice: number;
    if (residual <= 1.5) nice = 1;
    else if (residual <= 3.5) nice = 2;
    else if (residual <= 7.5) nice = 5;
    else nice = 10;
    return Math.max(nice * mag, 1);
  }

  const xInterval = niceTickInterval(xMin, xMax);
  const yInterval = niceTickInterval(yMin, yMax);

  const xTicks: number[] = [];
  const yTicks: number[] = [];
  for (let v = Math.ceil(xMin / xInterval) * xInterval; v <= Math.floor(xMax); v += xInterval) xTicks.push(v);
  for (let v = Math.ceil(yMin / yInterval) * yInterval; v <= Math.floor(yMax); v += yInterval) yTicks.push(v);

  // Origin in SVG coords
  const [originX, originY] = dataToSvg(0, 0, xMin, xMax, yMin, yMax, bx, by, bw, bh);

  // Axis endpoints
  const [axisLeft] = dataToSvg(xMin, 0, xMin, xMax, yMin, yMax, bx, by, bw, bh);
  const [axisRight] = dataToSvg(xMax, 0, xMin, xMax, yMin, yMax, bx, by, bw, bh);
  const [, axisTop] = dataToSvg(0, yMax, xMin, xMax, yMin, yMax, bx, by, bw, bh);
  const [, axisBottom] = dataToSvg(0, yMin, xMin, xMax, yMin, yMax, bx, by, bw, bh);

  // ── Force-directed label placement ────────────────────────────────
  // Collect every annotation (point notes, point coordinate labels,
  // line/function labels, axis titles) as a "seed" with an estimated
  // bbox + initial position from the existing per-label heuristic.
  // Collect every rendered stroke (lines, function polylines, implicit
  // axes). Run the relaxer to push labels off strokes and apart from
  // each other. The map is read by the per-element render below.
  const labelPlacements = useMemo(() => {
    const seeds: LabelSeed[] = [];
    const strokes: StrokeSegment[] = [];
    // Tight plot bounds — the gridded interior, NOT the outer
    // padding zone. Labels for points/lines/curves should stay inside
    // here so they don't drift into the tick-label area or get
    // clipped at the SVG edge. Axis titles aren't seeds, so they're
    // not constrained by this.
    const plotBounds = {
      x: bx + PADDING,
      y: by + PADDING,
      width: bw - 2 * PADDING,
      height: bh - 2 * PADDING,
    };
    // Plot frame edges as static repulsors so labels are pushed off
    // the gridded interior boundary, not just the SVG edge.
    const px0 = bx + PADDING;
    const py0 = by + PADDING;
    const px1 = bx + bw - PADDING;
    const py1 = by + bh - PADDING;
    strokes.push({ id: "plot-edge-top", ax: px0, ay: py0, bx: px1, by: py0 });
    strokes.push({ id: "plot-edge-bottom", ax: px0, ay: py1, bx: px1, by: py1 });
    strokes.push({ id: "plot-edge-left", ax: px0, ay: py0, bx: px0, by: py1 });
    strokes.push({ id: "plot-edge-right", ax: px1, ay: py0, bx: px1, by: py1 });

    // Estimated bbox: width ≈ characters × charWidth; height ≈ font + 6.
    const estimateBBox = (text: string, fontSize: number) => ({
      width: Math.max(20, text.length * fontSize * 0.55 + 8),
      height: fontSize + 6,
    });

    // Implicit axes (only if origin is in the plot range).
    if (yMin <= 0 && yMax >= 0) {
      const [ax0, ay0] = dataToSvg(xMin, 0, xMin, xMax, yMin, yMax, bx, by, bw, bh);
      const [ax1, ay1] = dataToSvg(xMax, 0, xMin, xMax, yMin, yMax, bx, by, bw, bh);
      strokes.push({ id: "axis-x", ax: ax0, ay: ay0, bx: ax1, by: ay1 });
    }
    if (xMin <= 0 && xMax >= 0) {
      const [ax0, ay0] = dataToSvg(0, yMin, xMin, xMax, yMin, yMax, bx, by, bw, bh);
      const [ax1, ay1] = dataToSvg(0, yMax, xMin, xMax, yMin, yMax, bx, by, bw, bh);
      strokes.push({ id: "axis-y", ax: ax0, ay: ay0, bx: ax1, by: ay1 });
    }

    // Strokes + label seeds per element.
    for (let i = 0; i < action.elements.length; i++) {
      const elem = action.elements[i];
      if (elem.type === "line") {
        const ends = _readEndpoints(elem);
        if (!ends) continue;
        const [x1, y1] = dataToSvg(ends.from[0], ends.from[1], xMin, xMax, yMin, yMax, bx, by, bw, bh);
        const [x2, y2] = dataToSvg(ends.to[0], ends.to[1], xMin, xMax, yMin, yMax, bx, by, bw, bh);
        const ownStrokeId = `line-${i}`;
        strokes.push({ id: ownStrokeId, ax: x1, ay: y1, bx: x2, by: y2 });
        if (elem.label) {
          // Seed at midpoint perpendicular-up by 28 (matches the
          // existing render's leader length); the relaxer will push
          // it further if it overlaps.
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const dx = x2 - x1;
          const dy = y2 - y1;
          const tlen = Math.hypot(dx, dy) || 1;
          const perpX = dy / tlen;
          const perpY = -dx / tlen;
          // Bias toward "up" (negative y) so the label starts above the line.
          const sign = perpY < 0 ? 1 : -1;
          const off = 28 * sign;
          const bb = estimateBBox(elem.label, 13);
          seeds.push({
            id: `linelabel-${i}`,
            anchor: { x: mx, y: my },
            pos: { x: mx + perpX * off, y: my + perpY * off },
            width: bb.width,
            height: bb.height,
            leadered: true,
            // Intentionally NOT setting ownStrokeId — let the line
            // repel its own label so the label settles a clear
            // perpendicular distance off (~13px at the spring +
            // repulsion equilibrium) instead of drifting onto the
            // stroke when no other repulsors are nearby.
          });
        }
      } else if (elem.type === "function") {
        if (!Array.isArray(elem.points) || elem.points.length < 2) continue;
        const ownStrokeId = `function-${i}`;
        const polyPts = elem.points.map(([dx, dy]) =>
          dataToSvg(dx, dy, xMin, xMax, yMin, yMax, bx, by, bw, bh),
        );
        for (let j = 0; j < polyPts.length - 1; j++) {
          strokes.push({
            id: `${ownStrokeId}-seg-${j}`,
            ax: polyPts[j][0],
            ay: polyPts[j][1],
            bx: polyPts[j + 1][0],
            by: polyPts[j + 1][1],
          });
        }
        if (elem.label && polyPts.length > 0) {
          // Anchor at 70% of the curve (matches existing render).
          const anchorIdx = Math.max(0, Math.floor(polyPts.length * 0.7));
          const [ax, ay] = polyPts[anchorIdx];
          const prevIdx = Math.max(0, anchorIdx - 1);
          const nextIdx = Math.min(polyPts.length - 1, anchorIdx + 1);
          const dx = polyPts[nextIdx][0] - polyPts[prevIdx][0];
          const dy = polyPts[nextIdx][1] - polyPts[prevIdx][1];
          const tlen = Math.hypot(dx, dy) || 1;
          const perpX = dy / tlen;
          const perpY = -dx / tlen;
          const sign = perpY < 0 ? 1 : -1;
          const off = 28 * sign;
          const bb = estimateBBox(elem.label, 13);
          seeds.push({
            id: `fnlabel-${i}`,
            anchor: { x: ax, y: ay },
            pos: { x: ax + perpX * off, y: ay + perpY * off },
            width: bb.width,
            height: bb.height,
            leadered: true,
            // ownStrokeId omitted on purpose — see linelabel above.
            // The function curve repels its own label like any other
            // stroke so the label keeps clearance from it.
          });
        }
      } else if (elem.type === "vertical_line") {
        const [vx, vy0] = dataToSvg(elem.x, yMin, xMin, xMax, yMin, yMax, bx, by, bw, bh);
        const [, vy1] = dataToSvg(elem.x, yMax, xMin, xMax, yMin, yMax, bx, by, bw, bh);
        strokes.push({ id: `vline-${i}`, ax: vx, ay: vy0, bx: vx, by: vy1 });
      } else if (elem.type === "horizontal_line") {
        const [hx0, hy] = dataToSvg(xMin, elem.y, xMin, xMax, yMin, yMax, bx, by, bw, bh);
        const [hx1] = dataToSvg(xMax, elem.y, xMin, xMax, yMin, yMax, bx, by, bw, bh);
        strokes.push({ id: `hline-${i}`, ax: hx0, ay: hy, bx: hx1, by: hy });
      } else if (elem.type === "point") {
        const pt = _readPoint(elem);
        if (!pt) continue;
        const [px, py] = dataToSvg(pt[0], pt[1], xMin, xMax, yMin, yMax, bx, by, bw, bh);
        // Point note (with leader) — initial direction from the existing
        // chooseAnnotationDir helper, which already factors clear-room
        // and edge-overshoot. The relaxer fine-tunes from there.
        if (elem.note) {
          // Fall back to the auto-direction when placement is absent OR is
          // a value outside the ne/nw/se/sw set (the agent occasionally
          // emits e.g. "top"/"above"); PLACEMENT_DIR[bad] is undefined and
          // would crash on `.x` below.
          const dir =
            (elem.note.placement && PLACEMENT_DIR[elem.note.placement]) ||
            chooseAnnotationDir(
              px, py, null, null,
              56, 100,
              action.elements,
              xMin, xMax, yMin, yMax, bx, by, bw, bh,
            );
          const leaderLen = 56;
          const bb = estimateBBox(elem.note.text, 13);
          seeds.push({
            id: `note-${i}`,
            anchor: { x: px, y: py },
            pos: {
              x: px + dir.x * (leaderLen + bb.width / 2),
              y: py + dir.y * (leaderLen + bb.height / 2),
            },
            width: bb.width,
            height: bb.height,
            leadered: true,
          });
        }
        // Point coordinate label (no leader) — sits just off the marker.
        if (elem.label) {
          const r = elem.style?.radius ?? 4;
          // If a note exists, place the coord label on the OPPOSITE side
          // (matches the existing render's labelDir convention) so they
          // don't pile on top of each other.
          const noteSeed = elem.note;
          let labelDir: Vec = { x: 0.85, y: -0.55 };
          if (noteSeed) {
            const noteDir =
              (noteSeed.placement && PLACEMENT_DIR[noteSeed.placement]) ||
              chooseAnnotationDir(
                px, py, null, null,
                56, 100,
                action.elements,
                xMin, xMax, yMin, yMax, bx, by, bw, bh,
              );
            labelDir = { x: -noteDir.x, y: -noteDir.y };
          }
          const bb = estimateBBox(elem.label, 13);
          const labelOffset = r + 6 + bb.width / 2;
          seeds.push({
            id: `ptlabel-${i}`,
            anchor: { x: px, y: py },
            pos: {
              x: px + labelDir.x * labelOffset,
              y: py + labelDir.y * (r + 12),
            },
            width: bb.width,
            height: bb.height,
            leadered: false,
          });
        }
      }
    }

    return relaxLabels(seeds, strokes, plotBounds);
  }, [action, xMin, xMax, yMin, yMax, bx, by, bw, bh]);

  // Plot interior used both as the visual clipping region for any
  // stroke (so lines with steep slopes or out-of-range endpoints can't
  // bleed past the plot frame into the tick-label area) and as the
  // bounds for label placement.
  const plotClipX = bx + PADDING;
  const plotClipY = by + PADDING;
  const plotClipW = bw - 2 * PADDING;
  const plotClipH = bh - 2 * PADDING;

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={plotClipX} y={plotClipY} width={plotClipW} height={plotClipH} />
        </clipPath>
      </defs>
      {/* Grid lines */}
      {showGrid && (
        <g>
          {xTicks.map((v) => {
            const [sx] = dataToSvg(v, 0, xMin, xMax, yMin, yMax, bx, by, bw, bh);
            return (
              <line
                key={`xg-${v}`}
                x1={sx}
                y1={by + PADDING}
                x2={sx}
                y2={by + bh - PADDING}
                style={{ stroke: "var(--border)" }}
                strokeWidth="0.5"
              />
            );
          })}
          {yTicks.map((v) => {
            const [, sy] = dataToSvg(0, v, xMin, xMax, yMin, yMax, bx, by, bw, bh);
            return (
              <line
                key={`yg-${v}`}
                x1={bx + PADDING}
                y1={sy}
                x2={bx + bw - PADDING}
                y2={sy}
                style={{ stroke: "var(--border)" }}
                strokeWidth="0.5"
              />
            );
          })}
        </g>
      )}

      {/* X axis */}
      <line
        x1={axisLeft}
        y1={originY}
        x2={axisRight}
        y2={originY}
        style={{ stroke: "var(--foreground)" }}
        strokeWidth="1.5"
      />
      {/* X axis arrow */}
      <polygon
        points={`${axisRight},${originY} ${axisRight - 8},${originY - 4} ${axisRight - 8},${originY + 4}`}
        style={{ fill: "var(--foreground)" }}
      />

      {/* Y axis */}
      <line
        x1={originX}
        y1={axisBottom}
        x2={originX}
        y2={axisTop}
        style={{ stroke: "var(--foreground)" }}
        strokeWidth="1.5"
      />
      {/* Y axis arrow */}
      <polygon
        points={`${originX},${axisTop} ${originX - 4},${axisTop + 8} ${originX + 4},${axisTop + 8}`}
        style={{ fill: "var(--foreground)" }}
      />

      {/* X tick marks + labels */}
      {xTicks.map((v) => {
        if (v === 0) return null;
        const [sx] = dataToSvg(v, 0, xMin, xMax, yMin, yMax, bx, by, bw, bh);
        return (
          <g key={`xt-${v}`}>
            <line x1={sx} y1={originY - 4} x2={sx} y2={originY + 4} style={{ stroke: "var(--foreground)" }} strokeWidth="1" />
            <text
              x={sx}
              y={originY + 16}
              textAnchor="middle"
              fontSize="13"
              style={{ fill: "var(--muted-foreground)" }}
              fontFamily="system-ui, sans-serif"
            >
              {v}
            </text>
          </g>
        );
      })}

      {/* Y tick marks + labels */}
      {yTicks.map((v) => {
        if (v === 0) return null;
        const [, sy] = dataToSvg(0, v, xMin, xMax, yMin, yMax, bx, by, bw, bh);
        return (
          <g key={`yt-${v}`}>
            <line x1={originX - 4} y1={sy} x2={originX + 4} y2={sy} style={{ stroke: "var(--foreground)" }} strokeWidth="1" />
            <text
              x={originX - 10}
              y={sy + 3}
              textAnchor="end"
              fontSize="13"
              style={{ fill: "var(--muted-foreground)" }}
              fontFamily="system-ui, sans-serif"
            >
              {v}
            </text>
          </g>
        );
      })}

      {/* Axis labels */}
      {action.axisLabels?.x && (
        <text
          x={axisRight + 12}
          y={originY + 4}
          fontSize="14"
          style={{ fill: "var(--secondary-foreground)" }}
          fontFamily="system-ui, sans-serif"
        >
          {action.axisLabels.x}
        </text>
      )}
      {action.axisLabels?.y && (
        <text
          x={originX + 8}
          y={axisTop - 4}
          fontSize="14"
          style={{ fill: "var(--secondary-foreground)" }}
          fontFamily="system-ui, sans-serif"
        >
          {action.axisLabels.y}
        </text>
      )}

      {/* Elements */}
      {action.elements.map((elem, i) => {
        switch (elem.type) {
          case "function": {
            const pathD = buildSmoothPath(
              elem.points,
              xMin,
              xMax,
              yMin,
              yMax,
              bx,
              by,
              bw,
              bh,
            );
            const pathRef = `coord-fn-${i}`;
            return (
              <g key={`fn-${i}`}>
                <g clipPath={`url(#${clipId})`}>
                  <motion.path
                    d={pathD}
                    fill="none"
                    stroke={adaptWbColor(elem.style?.strokeColor ?? "#2563eb", isDark)}
                    strokeWidth={elem.style?.strokeWidth ?? 2}
                    strokeDasharray={elem.style?.dashed ? "6 4" : undefined}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={isAnimating ? { pathLength: 0 } : undefined}
                    animate={{ pathLength: progress }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </g>
                {elem.label && (() => {
                  const placement = labelPlacements.get(`fnlabel-${i}`);
                  if (!placement) return null;
                  // Compute anchor in the same place the relaxer used
                  // (70% along the curve) so we can pick a textAnchor
                  // direction relative to it.
                  const anchorIdx = Math.max(0, Math.floor(elem.points.length * 0.7));
                  const [ax, ay] = dataToSvg(
                    elem.points[anchorIdx][0], elem.points[anchorIdx][1],
                    xMin, xMax, yMin, yMax, bx, by, bw, bh,
                  );
                  const dx = placement.x - ax;
                  const dy = placement.y - ay;
                  const r = Math.hypot(dx, dy) || 1;
                  const dirX = dx / r;
                  return (
                    <text
                      x={placement.x}
                      y={placement.y}
                      fontSize="14"
                      fill={adaptWbColor(elem.style?.strokeColor ?? "#2563eb", isDark)}
                      fontFamily="system-ui, sans-serif"
                      textAnchor={dirX > 0.3 ? "start" : dirX < -0.3 ? "end" : "middle"}
                      dominantBaseline="middle"
                    >
                      {elem.label}
                    </text>
                  );
                })()}
              </g>
            );
          }

          case "point": {
            const pt = _readPoint(elem);
            if (!pt) return null;
            const [px, py] = dataToSvg(pt[0], pt[1], xMin, xMax, yMin, yMax, bx, by, bw, bh);
            const filled = elem.style?.filled !== false;
            const r = elem.style?.radius ?? 4;
            const pointColor = adaptWbColor(elem.style?.color ?? "#2563eb", isDark);
            const note = elem.note;
            // Coordinate label + note positions come from the relaxer
            // — it knows about other labels' bboxes and rendered
            // strokes, so it can push them apart and off lines that
            // the per-label heuristic alone wouldn't notice.
            const ptLabelPlacement = elem.label
              ? labelPlacements.get(`ptlabel-${i}`)
              : null;
            const notePlacement = note ? labelPlacements.get(`note-${i}`) : null;
            // Anchor selection from where the relaxer settled the
            // label relative to the marker.
            const ptLabelDir = ptLabelPlacement
              ? (() => {
                  const dx = ptLabelPlacement.x - px;
                  const dy = ptLabelPlacement.y - py;
                  const r2 = Math.hypot(dx, dy) || 1;
                  return { x: dx / r2, y: dy / r2 };
                })()
              : { x: 0.85, y: -0.55 };
            const ptLabelAnchor: "start" | "end" | "middle" =
              ptLabelDir.x > 0.3 ? "start" : ptLabelDir.x < -0.3 ? "end" : "middle";

            const noteDirRelaxed = notePlacement
              ? (() => {
                  const dx = notePlacement.x - px;
                  const dy = notePlacement.y - py;
                  const r2 = Math.hypot(dx, dy) || 1;
                  return { x: dx / r2, y: dy / r2 };
                })()
              : null;
            const noteAnchor: "start" | "end" | "middle" = noteDirRelaxed
              ? noteDirRelaxed.x > 0.3
                ? "start"
                : noteDirRelaxed.x < -0.3
                  ? "end"
                  : "middle"
              : "start";
            // Leader endpoints: from the marker outward to a point just
            // before the label position (so the leader doesn't cut
            // through the text).
            const leaderInset = 8;
            const noteLeaderEnd = notePlacement && noteDirRelaxed
              ? {
                  x: notePlacement.x - noteDirRelaxed.x * leaderInset,
                  y: notePlacement.y - noteDirRelaxed.y * leaderInset,
                }
              : null;
            const noteLeaderStart = noteDirRelaxed
              ? {
                  x: px + noteDirRelaxed.x * (r + 4),
                  y: py + noteDirRelaxed.y * (r + 4),
                }
              : null;
            return (
              <g key={`pt-${i}`}>
                <motion.circle
                  cx={px}
                  cy={py}
                  r={r}
                  fill={filled ? pointColor : "var(--wb-canvas)"}
                  stroke={pointColor}
                  strokeWidth="2"
                  initial={{ scale: 0 }}
                  animate={{ scale: progress > 0 ? 1 : 0 }}
                  transition={{ duration: 0.2 }}
                />
                {elem.label && ptLabelPlacement && (
                  <text
                    x={ptLabelPlacement.x}
                    y={ptLabelPlacement.y}
                    textAnchor={ptLabelAnchor}
                    fontSize="13"
                    style={{ fill: "var(--secondary-foreground)" }}
                    fontFamily="system-ui, sans-serif"
                    dominantBaseline="middle"
                  >
                    {elem.label}
                  </text>
                )}
                {note && notePlacement && noteLeaderStart && noteLeaderEnd && (
                  <>
                    <line
                      x1={noteLeaderStart.x}
                      y1={noteLeaderStart.y}
                      x2={noteLeaderEnd.x}
                      y2={noteLeaderEnd.y}
                      stroke={pointColor}
                      strokeWidth="1"
                      opacity={progress > 0 ? 0.7 : 0}
                    />
                    <text
                      x={notePlacement.x}
                      y={notePlacement.y}
                      textAnchor={noteAnchor}
                      fontSize="13"
                      style={{ fill: pointColor }}
                      fontFamily="system-ui, sans-serif"
                      opacity={progress > 0 ? 1 : 0}
                      dominantBaseline="middle"
                    >
                      {note.text}
                    </text>
                  </>
                )}
              </g>
            );
          }

          case "line": {
            const ends = _readEndpoints(elem);
            if (!ends) return null;
            const [rawX1, rawY1] = dataToSvg(ends.from[0], ends.from[1], xMin, xMax, yMin, yMax, bx, by, bw, bh);
            const [rawX2, rawY2] = dataToSvg(ends.to[0], ends.to[1], xMin, xMax, yMin, yMax, bx, by, bw, bh);
            // Clip the author-supplied segment to the plot interior in
            // SVG space. Steep slopes (e.g. y=10x with xRange=[-2,2])
            // project endpoints far above/below the plot frame —
            // without clipping, the stroke-dasharray reveal animation
            // wastes most of its duration on the invisible portion
            // before the visible part appears.
            const clipped = clipSegmentToRect(
              rawX1, rawY1, rawX2, rawY2,
              plotClipX, plotClipY, plotClipW, plotClipH,
            );
            if (!clipped) return null;
            const { x1, y1, x2, y2 } = clipped;
            const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
            return (
              <g key={`ln-${i}`}>
                <g clipPath={`url(#${clipId})`}>
                  <motion.line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    style={{ stroke: elem.style?.strokeColor ?? "var(--secondary-foreground)" }}
                    strokeWidth={elem.style?.strokeWidth ?? 1.5}
                    strokeDasharray={elem.style?.dashed ? "6 4" : (isAnimating ? len : undefined)}
                    strokeDashoffset={isAnimating ? len * (1 - progress) : 0}
                  />
                </g>
                {elem.label && (() => {
                  const placement = labelPlacements.get(`linelabel-${i}`);
                  if (!placement) return null;
                  const mx = (x1 + x2) / 2;
                  const my = (y1 + y2) / 2;
                  const dx = placement.x - mx;
                  const dy = placement.y - my;
                  // Pick text anchor from where the relaxer settled the
                  // label relative to the line midpoint.
                  const r = Math.hypot(dx, dy) || 1;
                  const dirX = dx / r;
                  return (
                    <text
                      x={placement.x}
                      y={placement.y}
                      fontSize="13"
                      style={{ fill: "var(--secondary-foreground)" }}
                      fontFamily="system-ui, sans-serif"
                      textAnchor={dirX > 0.3 ? "start" : dirX < -0.3 ? "end" : "middle"}
                      dominantBaseline="middle"
                    >
                      {elem.label}
                    </text>
                  );
                })()}
              </g>
            );
          }

          case "vertical_line": {
            const [vx, vTop] = dataToSvg(elem.x, yMax, xMin, xMax, yMin, yMax, bx, by, bw, bh);
            const [, vBottom] = dataToSvg(elem.x, yMin, xMin, xMax, yMin, yMax, bx, by, bw, bh);
            return (
              <g key={`vl-${i}`}>
                <g clipPath={`url(#${clipId})`}>
                  <line
                    x1={vx}
                    y1={vTop}
                    x2={vx}
                    y2={vBottom}
                    style={{ stroke: elem.style?.strokeColor ?? "var(--muted-foreground)" }}
                    strokeWidth={elem.style?.strokeWidth ?? 1}
                    strokeDasharray={elem.style?.dashed ? "6 4" : "4 2"}
                  />
                </g>
                {elem.label && (
                  <text
                    x={vx + 4}
                    y={vTop + 12}
                    fontSize="13"
                    style={{ fill: "var(--muted-foreground)" }}
                    fontFamily="system-ui, sans-serif"
                  >
                    {elem.label}
                  </text>
                )}
              </g>
            );
          }

          case "horizontal_line": {
            const [hLeft, hy] = dataToSvg(xMin, elem.y, xMin, xMax, yMin, yMax, bx, by, bw, bh);
            const [hRight] = dataToSvg(xMax, elem.y, xMin, xMax, yMin, yMax, bx, by, bw, bh);
            return (
              <g key={`hl-${i}`}>
                <g clipPath={`url(#${clipId})`}>
                  <line
                    x1={hLeft}
                    y1={hy}
                    x2={hRight}
                    y2={hy}
                    style={{ stroke: elem.style?.strokeColor ?? "var(--muted-foreground)" }}
                    strokeWidth={elem.style?.strokeWidth ?? 1}
                    strokeDasharray={elem.style?.dashed ? "6 4" : "4 2"}
                  />
                </g>
                {elem.label && (
                  <text
                    x={hRight - 4}
                    y={hy - 4}
                    textAnchor="end"
                    fontSize="13"
                    style={{ fill: "var(--muted-foreground)" }}
                    fontFamily="system-ui, sans-serif"
                  >
                    {elem.label}
                  </text>
                )}
              </g>
            );
          }

          default:
            return null;
        }
      })}
    </motion.g>
  );
}
