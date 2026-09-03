/**
 * Math correctness evaluator: equivalence + operation fidelity.
 *
 * v1 checks fidelity for add/subtract/multiply/divide/substitute only.
 * distribute/factor/combine are left as warning-only (reported but don't
 * count as fidelity failures) because heuristics for them get fuzzy fast.
 *
 * Implementation: spawns a persistent `python3 agents/eval_math_shim.py`
 * subprocess and pipelines JSON requests/responses over stdio. One
 * subprocess per `evaluateMath()` call — cheap (~50ms sympy import) and
 * avoids re-initializing between lessons.
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  FIDELITY_CHECKED_OPS,
  type EquivalenceError,
  type FidelityError,
  type LineFidelityError,
  type MathMetrics,
  type MicroLessonOperation,
  type WhiteboardStep,
} from "./types";

type ShimResponse = {
  ok: boolean;
  checkable?: boolean;
  equivalent?: boolean;
  match?: boolean;
  satisfies?: boolean;
  residual?: number;
  lhsDelta?: string;
  rhsDelta?: string;
  expectedLhs?: string;
  expectedRhs?: string;
  actualLhs?: string;
  actualRhs?: string;
  reason?: string;
};

type ShimRequest =
  | { task: "equivalence"; a: string; b: string }
  | {
      task: "fidelity";
      operation: string;
      operand: string;
      exprBefore: string;
      exprAfter: string;
      substituteVar?: string;
    }
  | {
      task: "point_satisfies";
      equation: string;
      x: number;
      y: number;
      tolerance?: number;
    };

async function resolveShimPath(): Promise<string> {
  // Walk up from this module to find repo root containing agents/.
  let here: string;
  try {
    here = dirname(fileURLToPath(import.meta.url));
  } catch {
    here = process.cwd();
  }
  for (let i = 0; i < 10; i++) {
    const candidate = join(here, "agents", "eval_math_shim.py");
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      /* keep walking */
    }
    const parent = dirname(here);
    if (parent === here) break;
    here = parent;
  }
  throw new Error("could not locate agents/eval_math_shim.py");
}

async function resolvePythonPath(): Promise<string> {
  // Prefer the agents venv if it exists
  let here: string;
  try {
    here = dirname(fileURLToPath(import.meta.url));
  } catch {
    here = process.cwd();
  }
  for (let i = 0; i < 10; i++) {
    const venvPy = join(here, "agents", ".venv", "bin", "python3");
    try {
      await fs.access(venvPy);
      return venvPy;
    } catch {
      /* keep walking */
    }
    const parent = dirname(here);
    if (parent === here) break;
    here = parent;
  }
  return "python3";
}

/** Pipe requests through the shim, one JSON line per request. */
async function runShim(requests: ShimRequest[]): Promise<ShimResponse[]> {
  if (requests.length === 0) return [];
  const shim = await resolveShimPath();
  const py = await resolvePythonPath();
  const child = spawn(py, [shim], { stdio: ["pipe", "pipe", "pipe"] });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout.on("data", (c) => stdoutChunks.push(Buffer.from(c)));
  child.stderr.on("data", (c) => stderrChunks.push(Buffer.from(c)));

  // Write all requests then close stdin.
  const payload = requests.map((r) => JSON.stringify(r)).join("\n") + "\n";
  await new Promise<void>((resolve) => {
    child.stdin.end(payload, () => resolve());
  });

  const code = await new Promise<number>((resolve) => child.on("close", resolve));
  const stderrText = Buffer.concat(stderrChunks).toString("utf8");
  if (code !== 0 && stderrText) {
    throw new Error(`eval_math_shim failed (${code}): ${stderrText.slice(0, 400)}`);
  }

  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const lines = stdout.split("\n").filter((l) => l.trim());
  return lines.map((l) => JSON.parse(l) as ShimResponse);
}

/** Strip common label decorations so the equation parses cleanly:
 *  inline `$...$`, surrounding whitespace, leading "label:" prefix.
 *  Returns null if there's no `=` (probably not an equation). */
function extractEquationFromLabel(raw: string | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  // Drop "Line: " / "Equation: " style prefixes
  s = s.replace(/^(line|equation)\s*[:\-]\s*/i, "");
  // Strip wrapping `$...$`
  if (s.startsWith("$") && s.endsWith("$")) s = s.slice(1, -1).trim();
  if (!s.includes("=")) return null;
  // Equation must mention x or y to be a 2D line; otherwise this is
  // probably a slope/coordinate annotation like "m = 2".
  if (!/[xy]/.test(s)) return null;
  return s;
}

export async function evaluateMath(steps: WhiteboardStep[]): Promise<MathMetrics> {
  // Collect all equivalence + fidelity + line requests first so we can batch them.
  type Job =
    | { kind: "equivalence"; stepId: number; req: ShimRequest }
    | {
        kind: "fidelity";
        stepId: number;
        operation: MicroLessonOperation;
        operand?: string;
        req: ShimRequest;
      }
    | {
        kind: "line";
        stepId: number;
        elementIndex: number;
        equation: string;
        endpoint: "from" | "to";
        point: [number, number];
        req: ShimRequest;
      };
  const jobs: Job[] = [];
  const fidelityCheckedOps = new Set<MicroLessonOperation>();
  const fidelitySkippedOps = new Set<MicroLessonOperation>();

  for (const step of steps) {
    // ── coordinate_plane line endpoint check ──────────────────────
    // For any line element with a label that looks like an equation,
    // verify both endpoints actually satisfy the equation.
    const action = step.action as Record<string, unknown> | undefined;
    if (action?.type === "coordinate_plane") {
      const elements = (action.elements as Array<Record<string, unknown>> | undefined) ?? [];
      elements.forEach((elem, idx) => {
        if (elem?.type !== "line") return;
        const eq = extractEquationFromLabel(elem.label as string | undefined);
        if (!eq) return;
        const from = elem.from as [number, number] | undefined;
        const to = elem.to as [number, number] | undefined;
        if (Array.isArray(from) && from.length === 2) {
          jobs.push({
            kind: "line",
            stepId: step.id,
            elementIndex: idx,
            equation: eq,
            endpoint: "from",
            point: [from[0], from[1]],
            req: { task: "point_satisfies", equation: eq, x: from[0], y: from[1] },
          });
        }
        if (Array.isArray(to) && to.length === 2) {
          jobs.push({
            kind: "line",
            stepId: step.id,
            elementIndex: idx,
            equation: eq,
            endpoint: "to",
            point: [to[0], to[1]],
            req: { task: "point_satisfies", equation: eq, x: to[0], y: to[1] },
          });
        }
      });
    }

    if (step.action?.type !== "write_math") continue;
    const before = step.exprBefore?.trim();
    const after = step.exprAfter?.trim();

    // Equivalence check for any step with both before+after expressions.
    if (before && after) {
      jobs.push({
        kind: "equivalence",
        stepId: step.id,
        req: { task: "equivalence", a: before, b: after },
      });
    }

    // Fidelity check for v1-supported ops only.
    if (step.operation && step.phase === "apply" && before && after) {
      if (FIDELITY_CHECKED_OPS.has(step.operation)) {
        fidelityCheckedOps.add(step.operation);
        if (step.operand) {
          const req: ShimRequest = {
            task: "fidelity",
            operation: step.operation,
            operand: step.operand,
            exprBefore: before,
            exprAfter: after,
          };
          if (step.substituteVar) req.substituteVar = step.substituteVar;
          jobs.push({
            kind: "fidelity",
            stepId: step.id,
            operation: step.operation,
            operand: step.operand,
            req,
          });
        }
      } else if (step.operation) {
        // expanding op we're not checking fidelity for in v1
        fidelitySkippedOps.add(step.operation);
      }
    }
  }

  const requests = jobs.map((j) => j.req);
  const responses = await runShim(requests);

  const equivalenceErrors: EquivalenceError[] = [];
  const fidelityErrors: FidelityError[] = [];
  const lineErrors: LineFidelityError[] = [];
  let checkableCount = 0;
  let unparseableCount = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const resp = responses[i] ?? { ok: false, reason: "no response" };
    if (!resp.checkable) {
      unparseableCount++;
      continue;
    }
    checkableCount++;
    const step = steps.find((s) => s.id === job.stepId);
    if (job.kind === "equivalence") {
      // NOTE: equivalence on APPLY steps is often NOT true — the step
      // literally introduces a new operand, so before != after. We only
      // flag equivalence errors on COLLAPSE and STATE transitions.
      if (step?.phase === "collapse" || step?.phase === "state") {
        if (resp.equivalent === false) {
          equivalenceErrors.push({
            stepId: job.stepId,
            claim: `${step.phase} should preserve equation equivalence`,
            exprBefore: step?.exprBefore ?? null,
            exprAfter: step?.exprAfter ?? null,
            reason: `lhsDelta=${resp.lhsDelta}, rhsDelta=${resp.rhsDelta}`,
          });
        }
      }
    } else if (job.kind === "fidelity") {
      if (resp.match === false) {
        fidelityErrors.push({
          stepId: job.stepId,
          operation: job.operation,
          operand: job.operand,
          exprBefore: step?.exprBefore ?? null,
          exprAfter: step?.exprAfter ?? null,
          reason: `expected ${resp.expectedLhs} = ${resp.expectedRhs}, got ${resp.actualLhs} = ${resp.actualRhs}`,
        });
      }
    } else if (job.kind === "line") {
      if (resp.satisfies === false) {
        lineErrors.push({
          stepId: job.stepId,
          elementIndex: job.elementIndex,
          equation: job.equation,
          point: job.point,
          endpoint: job.endpoint,
          residual: typeof resp.residual === "number" ? resp.residual : NaN,
        });
      }
    }
  }

  const totalChecks = checkableCount + unparseableCount;
  const unparseableRate = totalChecks ? unparseableCount / totalChecks : 0;
  const errorCount =
    equivalenceErrors.length + fidelityErrors.length + lineErrors.length;
  const score =
    checkableCount === 0
      ? 1
      : Math.max(0, 1 - errorCount / Math.max(1, checkableCount));

  return {
    checkableCount,
    unparseableCount,
    unparseableRate,
    equivalenceErrors,
    fidelityErrors,
    lineErrors,
    fidelityCheckedOps: Array.from(fidelityCheckedOps),
    fidelitySkippedOps: Array.from(fidelitySkippedOps),
    score,
  };
}

export function summarizeMath(m: MathMetrics): string {
  const parts = [
    `math=${m.score.toFixed(2)}`,
    `checks=${m.checkableCount}`,
    m.equivalenceErrors.length ? `eq-errors=${m.equivalenceErrors.length}` : "",
    m.fidelityErrors.length ? `fid-errors=${m.fidelityErrors.length}` : "",
    m.lineErrors.length ? `line-errors=${m.lineErrors.length}` : "",
    m.unparseableCount ? `unparseable=${m.unparseableCount}` : "",
  ].filter(Boolean);
  return parts.join(" ");
}
