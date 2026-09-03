/**
 * Pen-tip geometry for the roaming tutor orb (?debug=orb).
 *
 * Given a whiteboard step, its reveal progress (0→1), and its laid-out
 * bounding box, returns the point the "pen" is currently at — in board /
 * viewBox coordinates (the same space as the SVG `viewBox` and the layout
 * x/y/width/height). The orb is animated to follow this point so it looks
 * like the AI is drawing the diagram.
 *
 * Geometry strokes are traced precisely (they're the primitives that actually
 * animate via `strokeDashoffset`, so the orb lands exactly on the growing
 * stroke). Other diagram types (coordinate planes, number lines, draw_shape)
 * don't have a single canonical stroke path, so the orb sweeps left→right
 * across their bounding box as they reveal — a "drawing" gesture without
 * pretending to trace a specific line.
 */
import type {
  WhiteboardStep,
  GeometryAction,
  GeoFigure,
  LocalPoint,
  CoordinatePlaneAction,
  NumberLineAction,
} from "@/types/whiteboard";

/** Diagram action types whose parts the orb can point at. */
export type PointableAction = GeometryAction | CoordinatePlaneAction | NumberLineAction;

export type LocalVec = { x: number; y: number };

export interface BoardBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BoardPoint = { x: number; y: number };

/**
 * The current step's location, published by the canvas so the resting orb can
 * hover beside the latest content (and re-derive its on-screen position each
 * frame as the board scrolls). `box` is in board/viewBox coords; `svg` + the
 * viewBox dims convert it to client px live.
 */
export interface StepFocus {
  box: BoardBox;
  svg: SVGSVGElement;
  viewBoxWidth: number;
  viewBoxHeight: number;
}

/** Step action types the orb treats as "drawn" diagrams. */
export function isDiagramStep(step: WhiteboardStep | undefined): boolean {
  if (!step) return false;
  const t = step.action.type;
  return (
    t === "geometry" ||
    t === "coordinate_plane" ||
    t === "number_line" ||
    t === "draw_shape"
  );
}

/** Local 0–100 point → board coords within the step's bounding box. */
function toBoard(p: LocalPoint, b: BoardBox): BoardPoint {
  return { x: b.x + (p.x / 100) * b.width, y: b.y + (p.y / 100) * b.height };
}

const CURVE_SEGMENTS = 48;

/**
 * Convert a single geometry figure into a sampled polyline (board coords).
 * Curves are approximated by {@link CURVE_SEGMENTS} segments so a single
 * arc-length sampler works for every figure type. Returns null for figures
 * with no traceable outline.
 */
function figurePolyline(fig: GeoFigure, b: BoardBox): BoardPoint[] | null {
  switch (fig.type) {
    case "polygon": {
      if (!fig.vertices?.length) return null;
      const pts = fig.vertices.map((v) => toBoard(v, b));
      pts.push(pts[0]); // close the loop — stroke returns to start
      return pts;
    }
    case "line_segment":
      return [toBoard(fig.from, b), toBoard(fig.to, b)];
    case "arrow":
      // Shaft only — matches the stroke that draws on.
      return [toBoard(fig.from, b), toBoard(fig.to, b)];
    case "circle": {
      const c = toBoard(fig.center, b);
      const r = (fig.radius / 100) * Math.min(b.width, b.height);
      return arc(c, r, r);
    }
    case "ellipse": {
      const c = toBoard(fig.center, b);
      return arc(c, (fig.rx / 100) * b.width, (fig.ry / 100) * b.height);
    }
    case "labeled_box": {
      const c = toBoard(fig.center, b);
      const hw = ((fig.width / 100) * b.width) / 2;
      const hh = ((fig.height / 100) * b.height) / 2;
      return [
        { x: c.x - hw, y: c.y - hh },
        { x: c.x + hw, y: c.y - hh },
        { x: c.x + hw, y: c.y + hh },
        { x: c.x - hw, y: c.y + hh },
        { x: c.x - hw, y: c.y - hh },
      ];
    }
    default:
      return null;
  }
}

/** Sampled points around an ellipse/circle starting at 3 o'clock, clockwise. */
function arc(c: BoardPoint, rx: number, ry: number): BoardPoint[] {
  const pts: BoardPoint[] = [];
  for (let i = 0; i <= CURVE_SEGMENTS; i++) {
    const a = (i / CURVE_SEGMENTS) * 2 * Math.PI;
    pts.push({ x: c.x + rx * Math.cos(a), y: c.y + ry * Math.sin(a) });
  }
  return pts;
}

function polylineLength(pts: BoardPoint[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

/** Point at fraction `t` (0–1) of the polyline's total arc length. */
function sampleAtFraction(pts: BoardPoint[], t: number): BoardPoint {
  if (pts.length === 1) return pts[0];
  const total = polylineLength(pts);
  if (total === 0) return pts[0];
  const target = Math.max(0, Math.min(1, t)) * total;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc + seg >= target) {
      const f = seg === 0 ? 0 : (target - acc) / seg;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f,
      };
    }
    acc += seg;
  }
  return pts[pts.length - 1];
}

/**
 * Per-figure draw schedule: partitions the overall [0,1] progress into one
 * slice per figure, proportional to each figure's stroke length, so the
 * figures draw **sequentially** at a constant pen speed (rather than all at
 * once). Aligned to the original `figures` array by index; non-traceable
 * figures get a zero-width slice. Shared with the renderer (wb-geometry) so
 * the drawn stroke and the orb's pen tip stay in lockstep.
 */
// Fraction of the step timeline spent travelling (not drawing) between two
// consecutive shapes, so the orb has time to glide to the next one instead of
// snapping. The step's duration is lengthened to match (see use-step-player).
const TRAVEL_GAP = 0.18;

export function geometryFigureSchedule(
  figures: GeoFigure[],
  b: BoardBox,
): { start: number; end: number }[] {
  const lens = figures.map((f) => {
    const poly = figurePolyline(f, b);
    return poly ? polylineLength(poly) : 0;
  });
  const traceable = lens.filter((l) => l > 0).length;
  const gaps = Math.max(0, traceable - 1);
  const drawPortion = Math.max(0.1, 1 - gaps * TRAVEL_GAP);
  const total = lens.reduce((a, c) => a + c, 0) || 1;
  let cursor = 0;
  let seen = 0;
  return lens.map((len) => {
    if (len <= 0) return { start: cursor, end: cursor }; // non-traceable
    if (seen > 0) cursor += TRAVEL_GAP; // travel gap before this shape
    const slice = drawPortion * (len / total);
    const seg = { start: cursor, end: cursor + slice };
    cursor += slice;
    seen++;
    return seg;
  });
}

/** Trace whichever figure is drawing, gliding across the travel gaps between. */
function geometryPenTip(
  action: GeometryAction,
  progress: number,
  b: BoardBox,
): BoardPoint | null {
  const figs = action.figures ?? [];
  const sched = geometryFigureSchedule(figs, b);
  // Collect the traceable shapes with their polylines, in draw order.
  const items: { seg: { start: number; end: number }; poly: BoardPoint[] }[] = [];
  for (let i = 0; i < figs.length; i++) {
    const seg = sched[i];
    if (!seg || seg.end <= seg.start) continue;
    const poly = figurePolyline(figs[i], b);
    if (poly) items.push({ seg, poly });
  }
  if (!items.length) return null;
  if (progress <= items[0].seg.start) return sampleAtFraction(items[0].poly, 0);

  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    if (progress >= it.seg.start && progress < it.seg.end) {
      const local = (progress - it.seg.start) / (it.seg.end - it.seg.start);
      return sampleAtFraction(it.poly, local);
    }
    if (progress < it.seg.start) {
      // In the travel gap before this shape — arc from prev end to its start
      // with a perpendicular bow (alternating side per hop) so the orb swoops
      // across with personality instead of sliding in a straight line.
      const prev = items[k - 1];
      const gs = prev.seg.end;
      const f = it.seg.start > gs ? (progress - gs) / (it.seg.start - gs) : 1;
      const a = sampleAtFraction(prev.poly, 1);
      const c = sampleAtFraction(it.poly, 0);
      const bx = a.x + (c.x - a.x) * f;
      const by = a.y + (c.y - a.y) * f;
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      // Perpendicular unit vector; bow peaks at mid-gap, side alternates by hop.
      const side = k % 2 === 0 ? 1 : -1;
      const bow = Math.sin(f * Math.PI) * Math.min(0.42 * dist, 110) * side;
      return { x: bx + (-dy / dist) * bow, y: by + (dx / dist) * bow };
    }
  }
  // Past every slice — rest at the end of the last stroke.
  return sampleAtFraction(items[items.length - 1].poly, 1);
}

/**
 * The pen-tip in board/viewBox coords for a diagram step at `progress`, or
 * null if the step isn't a (traceable) diagram.
 */
export function penTipForStep(
  step: WhiteboardStep | undefined,
  progress: number,
  box: BoardBox,
): BoardPoint | null {
  if (!step) return null;
  const action = step.action;
  if (action.type === "geometry") {
    return geometryPenTip(action, progress, box);
  }
  if (
    action.type === "coordinate_plane" ||
    action.type === "number_line" ||
    action.type === "draw_shape"
  ) {
    // No single canonical path — sweep across the box as it reveals.
    return {
      x: box.x + Math.max(0, Math.min(1, progress)) * box.width,
      y: box.y + box.height * 0.5,
    };
  }
  return null;
}

/**
 * Board/viewBox point → client (viewport) px, using the live SVG element rect.
 * The SVG scales its `viewBox` uniformly into its rendered box, so both axes
 * share the same scale; we map through width/height to stay robust if that
 * ever changes. Uses getBoundingClientRect (never offsetParent walks) for
 * cross-browser correctness.
 */
export function boardToClient(
  p: BoardPoint,
  svg: SVGSVGElement,
  viewBoxWidth: number,
  viewBoxHeight: number,
): BoardPoint {
  const rect = svg.getBoundingClientRect();
  return {
    x: rect.left + (p.x / viewBoxWidth) * rect.width,
    y: rect.top + (p.y / Math.max(1, viewBoxHeight)) * rect.height,
  };
}

// ── Shape-part resolution (orb pointing) ────────────────────────────────────

/** Centroid of the shape in local 0–100 space (polygon vertices, else center). */
function shapeCentroid(action: GeometryAction): LocalPoint {
  const pts: LocalPoint[] = [];
  for (const fig of action.figures ?? []) {
    if (fig.type === "polygon") pts.push(...fig.vertices);
    else if (fig.type === "circle" || fig.type === "ellipse" || fig.type === "labeled_box") pts.push(fig.center);
    else if (fig.type === "line_segment" || fig.type === "arrow") pts.push(fig.from, fig.to);
  }
  if (!pts.length) return { x: 50, y: 50 };
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

const mid = (a: LocalPoint, b: LocalPoint): LocalPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const norm = (s: string) => s.trim().toLowerCase();

/** Find a polygon vertex by its label (case-insensitive). */
function vertexByLabel(action: GeometryAction, label: string): LocalPoint | null {
  const want = norm(label);
  for (const fig of action.figures ?? []) {
    if (fig.type !== "polygon" || !fig.vertexLabels) continue;
    const i = fig.vertexLabels.findIndex((l) => l && norm(l) === want);
    if (i >= 0 && i < fig.vertices.length) return fig.vertices[i];
  }
  return null;
}

/**
 * Resolve a named part of a geometry shape to a local point (+ outward unit
 * vector from the shape centroid, so the orb can stand just outside it).
 * Resolution order: vertex label → side (two vertex labels) → a label /
 * dimension / box / connector text. Returns null if nothing matches.
 */
export function resolveShapePart(
  action: GeometryAction,
  part: string,
): { point: LocalPoint; outward: LocalVec } | null {
  if (!part) return null;
  const p = part.trim();
  let point: LocalPoint | null = null;

  // 1. Single vertex ("C").
  point = vertexByLabel(action, p);

  // 2. Side as a two-vertex pair ("AB", "BC"). Allow an optional separator.
  if (!point) {
    const letters = p.replace(/[\s-]/g, "");
    if (letters.length === 2) {
      const a = vertexByLabel(action, letters[0]);
      const b = vertexByLabel(action, letters[1]);
      if (a && b) point = mid(a, b);
    }
  }

  // 3. A label / dimension / labeled-box / connector text ("13", "hypotenuse").
  if (!point) {
    const want = norm(p);
    for (const lbl of action.labels ?? []) {
      if (norm(lbl.text) === want) { point = lbl.position; break; }
    }
    if (!point) {
      for (const ann of action.annotations ?? []) {
        if (ann.type === "dimension" && norm(ann.label) === want) { point = mid(ann.from, ann.to); break; }
        if (ann.type === "angle_arc" && ann.label && norm(ann.label) === want) { point = ann.vertex; break; }
      }
    }
    if (!point) {
      for (const fig of action.figures ?? []) {
        if (fig.type === "labeled_box" && norm(fig.text) === want) { point = fig.center; break; }
        if (fig.type === "arrow" && fig.label && norm(fig.label) === want) { point = mid(fig.from, fig.to); break; }
      }
    }
  }

  if (!point) return null;

  const c = shapeCentroid(action);
  let ox = point.x - c.x;
  let oy = point.y - c.y;
  const len = Math.hypot(ox, oy);
  if (len < 0.5) {
    ox = 0;
    oy = -1; // point ≈ centroid → stand above it
  } else {
    ox /= len;
    oy /= len;
  }
  return { point, outward: { x: ox, y: oy } };
}

/**
 * The spotlight published by the canvas: `point` is the exact part (where the
 * pulse renders), `anchor` is a standoff just outside it (where the orb parks),
 * both in board/viewBox coords. `svg` + viewBox dims convert them to client px
 * live (scroll-safe).
 */
export interface OrbSpotlight {
  point: BoardPoint;
  anchor: BoardPoint;
  svg: SVGSVGElement;
  viewBoxWidth: number;
  viewBoxHeight: number;
}

const STANDOFF_LOCAL = 16; // local units the orb stands outside the part

// ── Coordinate-plane / number-line part resolution ──────────────────────────
// These PADDING / offset constants MUST match the renderers so the orb lands
// exactly where the element was drawn:
//   wb-coordinate-plane.tsx  PADDING = 40
//   wb-number-line.tsx       PADDING = 30, LINE_Y_OFFSET = 0.55
const CP_PADDING = 40;
const NL_PADDING = 30;
const NL_LINE_Y = 55; // local y of the number-line, = LINE_Y_OFFSET * 100

/** Unit vector from the box center (50,50) through a local point — so the orb
 *  stands outside a plotted element. Defaults to "above" at the center. */
function outwardFromCenter(p: LocalPoint): LocalVec {
  const ox = p.x - 50;
  const oy = p.y - 50;
  const len = Math.hypot(ox, oy);
  if (len < 0.5) return { x: 0, y: -1 };
  return { x: ox / len, y: oy / len };
}

/** A coordinate-plane data point → local 0–100 (mirrors dataToSvg, including
 *  the equalScale squared/centered plot box the renderer uses). */
function cpDataToLocal(
  dx: number,
  dy: number,
  a: CoordinatePlaneAction,
  box: BoardBox,
  equalScale: boolean,
): LocalPoint {
  const [xMin, xMax] = a.xRange;
  const [yMin, yMax] = a.yRange;
  // Renderer's plot box within the layout box. Raw box, unless equalScale
  // enforces equal px-per-unit (then a centered square inset — see
  // wb-coordinate-plane.tsx).
  let bx = box.x, by = box.y, bw = box.width, bh = box.height;
  if (equalScale) {
    const xSpan = (xMax - xMin) || 1;
    const ySpan = (yMax - yMin) || 1;
    const pw = box.width - 2 * CP_PADDING;
    const ph = box.height - 2 * CP_PADDING;
    const s = Math.min(pw / xSpan, ph / ySpan);
    const ew = xSpan * s;
    const eh = ySpan * s;
    bx = box.x + (pw - ew) / 2;
    by = box.y + (ph - eh) / 2;
    bw = ew + 2 * CP_PADDING;
    bh = eh + 2 * CP_PADDING;
  }
  const sx = bx + CP_PADDING + ((dx - xMin) / (xMax - xMin || 1)) * (bw - 2 * CP_PADDING);
  const sy = by + CP_PADDING + ((yMax - dy) / (yMax - yMin || 1)) * (bh - 2 * CP_PADDING);
  // Board coords → local relative to the full layout box (toBoard inverts this).
  return { x: ((sx - box.x) / box.width) * 100, y: ((sy - box.y) / box.height) * 100 };
}

/** Parse a coordinate tuple like "(1, 2)", "1,2", "1 2" → [x, y]. */
function parseCoordTuple(s: string): [number, number] | null {
  const m = s.match(/-?\d+(?:\.\d+)?/g);
  if (!m || m.length < 2) return null;
  return [parseFloat(m[0]), parseFloat(m[1])];
}

/** Leading point name from a label like "A(1, 2)" → "A". */
function pointName(label: string | undefined): string {
  if (!label) return "";
  const m = label.match(/^\s*([A-Za-z][A-Za-z0-9'_]*)/);
  return m ? m[1] : "";
}

/** Resolve a named part of a coordinate plane: a point by label/name/note/
 *  coords, a bare coordinate tuple, "origin", or a line/function by label. */
export function resolveCoordinatePart(
  a: CoordinatePlaneAction,
  part: string,
  box: BoardBox,
  equalScale = false,
): { point: LocalPoint; outward: LocalVec } | null {
  if (!part) return null;
  const want = norm(part);
  const tuple = parseCoordTuple(part);
  const close = (v: number, w: number) => Math.abs(v - w) < 1e-6;
  let data: [number, number] | null = null;

  if (want === "origin") data = [0, 0];

  if (!data) {
    for (const el of a.elements ?? []) {
      if (el.type !== "point") continue;
      if (el.label && (norm(el.label) === want || norm(pointName(el.label)) === want)) { data = el.at; break; }
      if (el.note && norm(el.note.text) === want) { data = el.at; break; }
      if (tuple && close(el.at[0], tuple[0]) && close(el.at[1], tuple[1])) { data = el.at; break; }
    }
  }

  // A bare in-frame coordinate tuple that isn't a declared point — still pointable.
  if (!data && tuple) data = tuple;

  // Lines / functions by label → a representative point on them.
  if (!data) {
    for (const el of a.elements ?? []) {
      if (el.type === "line" && el.label && norm(el.label) === want) {
        data = [(el.from[0] + el.to[0]) / 2, (el.from[1] + el.to[1]) / 2]; break;
      }
      if (el.type === "function" && el.label && norm(el.label) === want && el.points.length) {
        data = el.points[Math.floor(el.points.length / 2)]; break;
      }
      if (el.type === "vertical_line" && el.label && norm(el.label) === want) {
        data = [el.x, (a.yRange[0] + a.yRange[1]) / 2]; break;
      }
      if (el.type === "horizontal_line" && el.label && norm(el.label) === want) {
        data = [(a.xRange[0] + a.xRange[1]) / 2, el.y]; break;
      }
    }
  }

  if (!data) return null;
  const point = cpDataToLocal(data[0], data[1], a, box, equalScale);
  return { point, outward: outwardFromCenter(point) };
}

/** Resolve a named part of a number line: a marked point by label or value, or
 *  a bare in-range value. */
export function resolveNumberLinePart(
  a: NumberLineAction,
  part: string,
  box: BoardBox,
): { point: LocalPoint; outward: LocalVec } | null {
  if (!part) return null;
  const want = norm(part);
  const ax = a as NumberLineAction & { min?: number; max?: number };
  const [rMin, rMax] = Array.isArray(a.range)
    ? a.range
    : typeof ax.min === "number" && typeof ax.max === "number"
      ? [ax.min, ax.max]
      : [0, 1];
  const numMatch = part.match(/-?\d+(?:\.\d+)?/);
  const num = numMatch ? parseFloat(numMatch[0]) : null;

  let value: number | null = null;
  for (const p of a.points ?? []) {
    if (p.label && norm(p.label) === want) { value = p.value; break; }
    if (num !== null && Math.abs(p.value - num) < 1e-6) { value = p.value; break; }
  }
  if (value === null && num !== null && num >= Math.min(rMin, rMax) && num <= Math.max(rMin, rMax)) {
    value = num;
  }
  if (value === null) return null;

  const localX = ((NL_PADDING + ((value - rMin) / (rMax - rMin || 1)) * (box.width - 2 * NL_PADDING)) / box.width) * 100;
  return { point: { x: localX, y: NL_LINE_Y }, outward: { x: 0, y: -1 } };
}

/** Resolve a step's named part to board-space pulse point + orb standoff,
 *  across any pointable diagram type (geometry, coordinate plane, number line). */
export function shapePartBoard(
  action: PointableAction,
  part: string,
  box: BoardBox,
  opts: { equalScale?: boolean } = {},
): { point: BoardPoint; anchor: BoardPoint } | null {
  let r: { point: LocalPoint; outward: LocalVec } | null = null;
  if (action.type === "geometry") r = resolveShapePart(action, part);
  else if (action.type === "coordinate_plane") r = resolveCoordinatePart(action, part, box, opts.equalScale);
  else if (action.type === "number_line") r = resolveNumberLinePart(action, part, box);
  if (!r) return null;
  return {
    point: toBoard(r.point, box),
    anchor: toBoard(
      { x: r.point.x + r.outward.x * STANDOFF_LOCAL, y: r.point.y + r.outward.y * STANDOFF_LOCAL },
      box,
    ),
  };
}
