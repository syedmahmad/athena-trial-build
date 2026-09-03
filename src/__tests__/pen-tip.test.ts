import { describe, it, expect } from "vitest";
import {
  penTipForStep,
  isDiagramStep,
  resolveShapePart,
  shapePartBoard,
  type BoardBox,
} from "@/components/whiteboard/pen-tip";
import type {
  GeometryAction,
  CoordinatePlaneAction,
  NumberLineAction,
  WhiteboardStep,
} from "@/types/whiteboard";

// A 100x100 box at the origin makes local 0–100 map 1:1 to board coords.
const BOX: BoardBox = { x: 0, y: 0, width: 100, height: 100 };

function geomStep(action: WhiteboardStep["action"]): WhiteboardStep {
  return { id: 1, action } as WhiteboardStep;
}

describe("isDiagramStep", () => {
  it("flags drawn diagram types and rejects text/math", () => {
    expect(isDiagramStep(geomStep({ type: "geometry", figures: [] }))).toBe(true);
    expect(
      isDiagramStep(geomStep({ type: "coordinate_plane", xRange: [0, 1], yRange: [0, 1], elements: [] })),
    ).toBe(true);
    expect(isDiagramStep(geomStep({ type: "write_text", text: "hi" } as never))).toBe(false);
    expect(isDiagramStep(undefined)).toBe(false);
  });
});

describe("penTipForStep — geometry line tracing", () => {
  const step = geomStep({
    type: "geometry",
    figures: [{ type: "line_segment", from: { x: 0, y: 0 }, to: { x: 100, y: 0 } }],
  });

  it("starts at the stroke origin at progress 0", () => {
    const tip = penTipForStep(step, 0, BOX);
    expect(tip).not.toBeNull();
    expect(tip!.x).toBeCloseTo(0, 5);
    expect(tip!.y).toBeCloseTo(0, 5);
  });

  it("reaches the stroke end at progress 1", () => {
    const tip = penTipForStep(step, 1, BOX)!;
    expect(tip.x).toBeCloseTo(100, 5);
    expect(tip.y).toBeCloseTo(0, 5);
  });

  it("is halfway along at progress 0.5", () => {
    const tip = penTipForStep(step, 0.5, BOX)!;
    expect(tip.x).toBeCloseTo(50, 5);
  });
});

describe("penTipForStep — picks the longest figure", () => {
  it("traces the long line, not the short one", () => {
    const step = geomStep({
      type: "geometry",
      figures: [
        { type: "line_segment", from: { x: 0, y: 0 }, to: { x: 10, y: 0 } }, // short
        { type: "line_segment", from: { x: 0, y: 50 }, to: { x: 100, y: 50 } }, // long
      ],
    });
    // At progress 1 the tip should sit at the END of the LONG line (x≈100,y≈50),
    // not the short one (x≈10,y≈0).
    const tip = penTipForStep(step, 1, BOX)!;
    expect(tip.x).toBeCloseTo(100, 5);
    expect(tip.y).toBeCloseTo(50, 5);
  });
});

describe("penTipForStep — polygon closes the loop", () => {
  it("returns to the first vertex at progress 1", () => {
    const step = geomStep({
      type: "geometry",
      figures: [
        {
          type: "polygon",
          vertices: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
          ],
        },
      ],
    });
    const start = penTipForStep(step, 0, BOX)!;
    const end = penTipForStep(step, 1, BOX)!;
    // Closed loop: end coincides with start.
    expect(end.x).toBeCloseTo(start.x, 5);
    expect(end.y).toBeCloseTo(start.y, 5);
    expect(start.x).toBeCloseTo(0, 5);
    expect(start.y).toBeCloseTo(0, 5);
  });
});

describe("penTipForStep — non-geometry diagrams sweep the box", () => {
  it("sweeps left→right across a coordinate plane", () => {
    const step = geomStep({
      type: "coordinate_plane",
      xRange: [0, 10],
      yRange: [0, 10],
      elements: [],
    });
    const box: BoardBox = { x: 200, y: 300, width: 400, height: 200 };
    const start = penTipForStep(step, 0, box)!;
    const mid = penTipForStep(step, 0.5, box)!;
    const end = penTipForStep(step, 1, box)!;
    expect(start.x).toBeCloseTo(200, 5);
    expect(mid.x).toBeCloseTo(400, 5);
    expect(end.x).toBeCloseTo(600, 5);
    // Constant mid-height sweep.
    expect(start.y).toBeCloseTo(400, 5);
    expect(end.y).toBeCloseTo(400, 5);
  });
});

describe("penTipForStep — null for non-diagram steps", () => {
  it("returns null for text", () => {
    expect(penTipForStep(geomStep({ type: "write_text", text: "x" } as never), 0.5, BOX)).toBeNull();
  });
});

describe("resolveShapePart", () => {
  // Right triangle A(0,100) B(0,0) C(80,100), labeled; hypotenuse label "13".
  const tri: GeometryAction = {
    type: "geometry",
    figures: [
      {
        type: "polygon",
        vertices: [
          { x: 0, y: 100 },
          { x: 0, y: 0 },
          { x: 80, y: 100 },
        ],
        vertexLabels: ["A", "B", "C"],
      },
    ],
    labels: [{ text: "13", position: { x: 40, y: 50 } }],
    annotations: [
      { type: "right_angle", vertex: { x: 0, y: 100 } },
      { type: "dimension", from: { x: 0, y: 100 }, to: { x: 80, y: 100 }, label: "8" },
    ],
  };

  it("resolves a vertex by label", () => {
    expect(resolveShapePart(tri, "C")?.point).toEqual({ x: 80, y: 100 });
    expect(resolveShapePart(tri, "B")?.point).toEqual({ x: 0, y: 0 });
  });

  it("is case-insensitive for vertex labels", () => {
    expect(resolveShapePart(tri, "c")?.point).toEqual({ x: 80, y: 100 });
  });

  it("resolves a side (vertex pair) to the midpoint", () => {
    // A(0,100) + C(80,100) midpoint
    expect(resolveShapePart(tri, "AC")?.point).toEqual({ x: 40, y: 100 });
    // separator tolerated
    expect(resolveShapePart(tri, "A-C")?.point).toEqual({ x: 40, y: 100 });
  });

  it("resolves a label text to its position", () => {
    expect(resolveShapePart(tri, "13")?.point).toEqual({ x: 40, y: 50 });
  });

  it("resolves a dimension label to its midpoint", () => {
    expect(resolveShapePart(tri, "8")?.point).toEqual({ x: 40, y: 100 });
  });

  it("returns null for an unknown part", () => {
    expect(resolveShapePart(tri, "Z")).toBeNull();
    expect(resolveShapePart(tri, "")).toBeNull();
  });

  it("gives an outward unit vector pointing away from the centroid", () => {
    // centroid ≈ (26.7, 66.7); C is down-right of it.
    const r = resolveShapePart(tri, "C")!;
    expect(Math.hypot(r.outward.x, r.outward.y)).toBeCloseTo(1, 5);
    expect(r.outward.x).toBeGreaterThan(0); // C is right of centroid
    expect(r.outward.y).toBeGreaterThan(0); // C is below centroid
  });
});

describe("shapePartBoard — coordinate plane", () => {
  // 400x300 box, 0..10 on both axes. PADDING=40 (matches the renderer).
  const box: BoardBox = { x: 0, y: 0, width: 400, height: 300 };
  const cp: CoordinatePlaneAction = {
    type: "coordinate_plane",
    xRange: [0, 10],
    yRange: [0, 10],
    elements: [
      { type: "point", at: [5, 5], label: "A(5, 5)" },
      { type: "point", at: [0, 3], note: { text: "y-intercept" } },
      { type: "line", from: [0, 3], to: [5, 5], label: "L1" },
    ],
  };

  // dataToSvg(5,5): 40 + 0.5*(400-80)=200 ; 40 + 0.5*(300-80)=150
  it("resolves a point by its name", () => {
    const r = shapePartBoard(cp, "A", box)!;
    expect(r.point.x).toBeCloseTo(200, 4);
    expect(r.point.y).toBeCloseTo(150, 4);
  });

  it("resolves a point by full label and by coordinate tuple", () => {
    expect(shapePartBoard(cp, "A(5, 5)", box)!.point.x).toBeCloseTo(200, 4);
    expect(shapePartBoard(cp, "(5,5)", box)!.point.x).toBeCloseTo(200, 4);
  });

  it("resolves a point by its semantic note", () => {
    // (0,3): x = 40 + 0*320 = 40 ; y = 40 + (7/10)*220 = 194
    const r = shapePartBoard(cp, "y-intercept", box)!;
    expect(r.point.x).toBeCloseTo(40, 4);
    expect(r.point.y).toBeCloseTo(194, 4);
  });

  it("resolves a line by label to its midpoint", () => {
    // midpoint of (0,3)-(5,5) = (2.5, 4): x = 40 + 0.25*320 = 120
    expect(shapePartBoard(cp, "L1", box)!.point.x).toBeCloseTo(120, 4);
  });

  it("resolves the origin", () => {
    const r = shapePartBoard(cp, "origin", box)!;
    expect(r.point.x).toBeCloseTo(40, 4); // x=0 -> left pad
    expect(r.point.y).toBeCloseTo(260, 4); // y=0 -> bottom: 40 + 1*220
  });

  it("returns null for an unknown part", () => {
    expect(shapePartBoard(cp, "Z", box)).toBeNull();
  });

  it("accounts for the equalScale squared/centered plot box", () => {
    // pw=320, ph=220, s=22 -> ew=eh=220, bx=50, by=0, bw=bh=300.
    // origin (0,0): sx=50+40=90 ; sy=0+40+1*220=260
    const r = shapePartBoard(cp, "origin", box, { equalScale: true })!;
    expect(r.point.x).toBeCloseTo(90, 4);
    expect(r.point.y).toBeCloseTo(260, 4);
  });
});

describe("shapePartBoard — number line", () => {
  // 400x200 box, range -6..4. PADDING=30, line at y=0.55*height.
  const box: BoardBox = { x: 0, y: 0, width: 400, height: 200 };
  const nl: NumberLineAction = {
    type: "number_line",
    range: [-6, 4],
    points: [{ value: -2, label: "x = -2" }],
  };

  // x: 30 + ((-2 - -6)/10)*(400-60) = 30 + 0.4*340 = 166 ; y: 0.55*200 = 110
  it("resolves a marked point by label", () => {
    const r = shapePartBoard(nl, "x = -2", box)!;
    expect(r.point.x).toBeCloseTo(166, 4);
    expect(r.point.y).toBeCloseTo(110, 4);
  });

  it("resolves by bare value", () => {
    expect(shapePartBoard(nl, "-2", box)!.point.x).toBeCloseTo(166, 4);
  });

  it("resolves an in-range value with no marked point", () => {
    // value 4 (range max): 30 + 1*340 = 370
    expect(shapePartBoard(nl, "4", box)!.point.x).toBeCloseTo(370, 4);
  });

  it("returns null for an out-of-range / unknown part", () => {
    expect(shapePartBoard(nl, "99", box)).toBeNull();
    expect(shapePartBoard(nl, "nope", box)).toBeNull();
  });
});
