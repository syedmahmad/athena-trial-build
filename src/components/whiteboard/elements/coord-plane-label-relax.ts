/**
 * Force-directed label placement for coordinate plane annotations.
 * Pure module: takes seed positions + stroke geometry + plot bounds,
 * iterates a relaxation loop, returns final placements per label id.
 *
 * Forces per iteration:
 *  - Stroke repulsion: each label's bbox center is pushed away from any
 *    nearby line/curve segment (excluding the stroke it's annotating).
 *  - Label–label repulsion: when two label bboxes overlap, push their
 *    centers apart along the connecting axis.
 *  - Anchor spring: a soft pull toward the original anchor so labels
 *    don't drift to the plot edges. Stiffer for non-leadered labels
 *    (point coordinate labels, axis titles) so they stay close.
 *
 * After each iteration the position is clamped so the bbox stays inside
 * the plot bounds. Step size decays geometrically (cool-down) so early
 * iterations move boldly and late iterations settle into a stable
 * configuration.
 *
 * The whole relaxation runs in CSS-pixel space (the SVG units the rest
 * of WbCoordinatePlane uses). No DOM, no React.
 */

export type LabelSeed = {
  /** Stable id used to look up the final placement after relaxation. */
  id: string;
  /** Anchor in SVG pixels — the point the label is annotating. */
  anchor: { x: number; y: number };
  /** Initial center position in SVG pixels (from the seed heuristic). */
  pos: { x: number; y: number };
  /** Estimated bbox width in CSS pixels. */
  width: number;
  /** Estimated bbox height in CSS pixels. */
  height: number;
  /** When true, the label has a leader line drawn back to its anchor —
   *  the spring is loose so the label can drift further. When false
   *  (e.g., point coordinate labels with no leader), the spring is
   *  stiff to keep the label visually attached to its anchor. */
  leadered: boolean;
  /** Stroke id this label is annotating. Excluded from repulsion so a
   *  line label can sit next to its line. */
  ownStrokeId?: string;
};

export type StrokeSegment = {
  id: string;
  ax: number; ay: number;
  bx: number; by: number;
};

export type LabelPlacement = { x: number; y: number };

export type RelaxOptions = {
  /** Total iterations. Default 15 — empirically converges for typical
   *  plot complexity. */
  iterations?: number;
  /** Distance below which a stroke pushes a label. Default 14. */
  strokeRadius?: number;
};

/** Distance from point (px, py) to segment (ax,ay)-(bx,by), plus the
 *  perpendicular direction from the segment toward the point (used to
 *  apply repulsion away from the segment). */
function pointToSegment(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number,
): { dist: number; dirX: number; dirY: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const dxp = px - cx;
  const dyp = py - cy;
  const dist = Math.hypot(dxp, dyp);
  if (dist < 1e-6) {
    // Coincident — pick an arbitrary perpendicular so we still push.
    const len = Math.hypot(dx, dy) || 1;
    return { dist: 0, dirX: -dy / len, dirY: dx / len };
  }
  return { dist, dirX: dxp / dist, dirY: dyp / dist };
}

/** Per-AABB-pair repulsion. Returns a force vector applied to label A
 *  (label B gets the negation). Force magnitude scales with the
 *  overlap amount on whichever axis has less overlap (the smaller
 *  separation distance — pushing along the axis of least resistance). */
function aabbOverlapForce(
  a: { cx: number; cy: number; w: number; h: number },
  b: { cx: number; cy: number; w: number; h: number },
): { fx: number; fy: number } {
  const dx = a.cx - b.cx;
  const dy = a.cy - b.cy;
  const overlapX = (a.w + b.w) / 2 - Math.abs(dx);
  const overlapY = (a.h + b.h) / 2 - Math.abs(dy);
  if (overlapX <= 0 || overlapY <= 0) return { fx: 0, fy: 0 };
  // Push along the axis with the smaller overlap (cheaper to escape).
  if (overlapX < overlapY) {
    const sign = dx >= 0 ? 1 : -1;
    return { fx: sign * overlapX * 1.5, fy: 0 };
  }
  const sign = dy >= 0 ? 1 : -1;
  return { fx: 0, fy: sign * overlapY * 1.5 };
}

export function relaxLabels(
  seeds: LabelSeed[],
  strokes: StrokeSegment[],
  bounds: { x: number; y: number; width: number; height: number },
  options: RelaxOptions = {},
): Map<string, LabelPlacement> {
  const { iterations = 25, strokeRadius = 14 } = options;
  const result = new Map<string, LabelPlacement>();
  if (seeds.length === 0) return result;

  // Working positions — mutated each iteration.
  const positions = seeds.map((s) => ({ x: s.pos.x, y: s.pos.y }));

  let step = 1.0;
  for (let iter = 0; iter < iterations; iter++) {
    // Compute forces on each label for this iteration.
    const forces = seeds.map(() => ({ fx: 0, fy: 0 }));

    // Build dynamic leader-line strokes for this iteration so labels
    // also push off OTHER labels' leaders (not just rendered geometry).
    // Each leadered label has a leader from its anchor to its current
    // position; without this, two labels can land such that one's
    // leader cuts through the other's text.
    const leaderStrokes: StrokeSegment[] = [];
    for (let i = 0; i < seeds.length; i++) {
      if (seeds[i].leadered) {
        leaderStrokes.push({
          id: `leader-${seeds[i].id}`,
          ax: seeds[i].anchor.x,
          ay: seeds[i].anchor.y,
          bx: positions[i].x,
          by: positions[i].y,
        });
      }
    }

    // Stroke repulsion (each label vs each stroke, except its own).
    const allStrokes = [...strokes, ...leaderStrokes];
    for (let i = 0; i < seeds.length; i++) {
      const seed = seeds[i];
      const cx = positions[i].x;
      const cy = positions[i].y;
      const ownLeaderId = `leader-${seed.id}`;
      for (const stroke of allStrokes) {
        // Exclude this label's own annotated stroke (line/function
        // it's labeling) AND its own leader. Matches exact id OR a
        // segment id prefixed with `${ownStrokeId}-` so a function
        // can register multiple polyline segments under the same
        // logical id and a single label exclusion covers all of them.
        if (stroke.id === ownLeaderId) continue;
        if (
          seed.ownStrokeId &&
          (stroke.id === seed.ownStrokeId ||
            stroke.id.startsWith(seed.ownStrokeId + "-"))
        ) {
          continue;
        }
        const { dist, dirX, dirY } = pointToSegment(
          cx, cy, stroke.ax, stroke.ay, stroke.bx, stroke.by,
        );
        // Repulsion radius accounts for label half-extent on each axis
        // — a wide label needs more clearance from a vertical stroke.
        const halfX = seed.width / 2;
        const halfY = seed.height / 2;
        // Project the label's half-extent onto the segment's
        // perpendicular direction so wide labels demand more lateral
        // clearance than tall labels (and vice versa).
        const labelExtent = Math.abs(dirX) * halfX + Math.abs(dirY) * halfY;
        const minDist = strokeRadius + labelExtent;
        if (dist < minDist) {
          const push = (minDist - dist);
          forces[i].fx += dirX * push;
          forces[i].fy += dirY * push;
        }
      }
    }

    // Label–label repulsion (each pair).
    for (let i = 0; i < seeds.length; i++) {
      for (let j = i + 1; j < seeds.length; j++) {
        const a = {
          cx: positions[i].x, cy: positions[i].y,
          w: seeds[i].width + 4, h: seeds[i].height + 4,
        };
        const b = {
          cx: positions[j].x, cy: positions[j].y,
          w: seeds[j].width + 4, h: seeds[j].height + 4,
        };
        const f = aabbOverlapForce(a, b);
        // Split the force evenly — each label moves half.
        forces[i].fx += f.fx * 0.5;
        forces[i].fy += f.fy * 0.5;
        forces[j].fx -= f.fx * 0.5;
        forces[j].fy -= f.fy * 0.5;
      }
    }

    // Anchor spring + bounds clamp + apply forces.
    for (let i = 0; i < seeds.length; i++) {
      const seed = seeds[i];
      // Leadered labels can drift further (the leader keeps the
      // visual connection), so a loose spring is fine. Non-leadered
      // labels (point coordinate labels, axis titles) NEED to stay
      // close to their anchor — there's no visual connector — so
      // the spring is much stiffer.
      const springK = seed.leadered ? 0.05 : 0.50;
      forces[i].fx += (seed.anchor.x - positions[i].x) * springK;
      forces[i].fy += (seed.anchor.y - positions[i].y) * springK;

      positions[i].x += forces[i].fx * step;
      positions[i].y += forces[i].fy * step;

      // Clamp so the label's bbox stays inside `bounds`.
      const halfW = seed.width / 2;
      const halfH = seed.height / 2;
      positions[i].x = Math.max(
        bounds.x + halfW,
        Math.min(bounds.x + bounds.width - halfW, positions[i].x),
      );
      positions[i].y = Math.max(
        bounds.y + halfH,
        Math.min(bounds.y + bounds.height - halfH, positions[i].y),
      );
    }

    step *= 0.85; // cool-down
  }

  for (let i = 0; i < seeds.length; i++) {
    result.set(seeds[i].id, { x: positions[i].x, y: positions[i].y });
  }
  return result;
}
