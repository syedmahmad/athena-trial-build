import { describe, expect, it } from "vitest";
import { evaluateAdherence } from "@/lib/evals/adherence";
import type { WhiteboardStep, GeometryAction } from "@/types/whiteboard";

/**
 * Pins the dangling-orb-pointer guardrail. A step's `orbFocus.part` (the
 * roaming orb's pointing target) must resolve against the geometry shape it
 * references, or the orb has nothing to walk to. The eval flags the dangling
 * ones so a self-critique pass can drop or fix them.
 */

const TRIANGLE: GeometryAction = {
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
};

function makeStep(
  id: number,
  action: WhiteboardStep["action"],
  extras: Partial<WhiteboardStep> = {},
): WhiteboardStep {
  return { id, delayMs: 0, durationMs: 0, action, ...extras };
}

describe("dangling orb-focus detection", () => {
  it("passes when the part resolves against the most recent geometry step", () => {
    const steps = [
      makeStep(0, TRIANGLE),
      makeStep(1, { type: "write_text", text: "C is the right angle." } as WhiteboardStep["action"], {
        orbFocus: { part: "C" },
      }),
      makeStep(2, { type: "write_text", text: "The hypotenuse is 13." } as WhiteboardStep["action"], {
        orbFocus: { part: "13" },
      }),
    ];
    expect(evaluateAdherence(steps).danglingOrbFocus).toEqual([]);
  });

  it("flags a part name not present on the shape", () => {
    const steps = [
      makeStep(0, TRIANGLE),
      makeStep(1, { type: "write_text", text: "Look at Z." } as WhiteboardStep["action"], {
        orbFocus: { part: "Z" },
      }),
    ];
    const d = evaluateAdherence(steps).danglingOrbFocus;
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ stepId: 1, part: "Z" });
  });

  it("flags an orbFocus with no geometry shape to point at", () => {
    const steps = [
      makeStep(0, { type: "write_math", latex: "x = 1" } as WhiteboardStep["action"]),
      makeStep(1, { type: "write_text", text: "Look at C." } as WhiteboardStep["action"], {
        orbFocus: { part: "C" },
      }),
    ];
    const d = evaluateAdherence(steps).danglingOrbFocus;
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ stepId: 1, part: "C" });
  });

  it("ignores steps without orbFocus", () => {
    const steps = [makeStep(0, TRIANGLE), makeStep(1, { type: "write_text", text: "hi" } as WhiteboardStep["action"])];
    expect(evaluateAdherence(steps).danglingOrbFocus).toEqual([]);
  });
});
