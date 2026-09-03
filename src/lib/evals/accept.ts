/**
 * Phase 5 acceptance gates for a single lesson.
 */

import type { AdherenceMetrics, MathMetrics } from "./types";

export type AcceptanceOptions = {
  /** Require triplets to fully cover expected expanding ops. */
  requireFullTripletCoverage?: boolean;
  /** Max rate of write_math steps that were unparseable for math eval. */
  maxUnparseableRate?: number;
  /** Adherence gate: taggedOperationPct must be at least this. */
  minTaggedOperationPct?: number;
};

export const DEFAULT_ACCEPTANCE: Required<AcceptanceOptions> = {
  requireFullTripletCoverage: true,
  maxUnparseableRate: 0.2,
  minTaggedOperationPct: 0.9,
};

export function acceptLesson(
  adherence: AdherenceMetrics,
  math: MathMetrics | null,
  opts: AcceptanceOptions = {},
): { pass: boolean; reasons: string[] } {
  const o = { ...DEFAULT_ACCEPTANCE, ...opts };
  const reasons: string[] = [];

  if (o.requireFullTripletCoverage && adherence.tripletCount < adherence.expectedTripletCount) {
    reasons.push(
      `triplets ${adherence.tripletCount}/${adherence.expectedTripletCount} below full coverage`,
    );
  }
  if (adherence.orphanedExpandingOps.length) {
    reasons.push(`${adherence.orphanedExpandingOps.length} orphaned expanding op(s)`);
  }
  if (adherence.brokenTriplets.length) {
    reasons.push(`${adherence.brokenTriplets.length} broken triplet(s)`);
  }
  if (adherence.invalidOperations.length) {
    reasons.push(`${adherence.invalidOperations.length} invalid operation value(s)`);
  }
  const strongNarrationBugs = adherence.suspiciousNarrations.filter((n) => n.severity === "strong");
  if (strongNarrationBugs.length) {
    reasons.push(
      `${strongNarrationBugs.length} interaction narration(s) leak the answer: step(s) ${strongNarrationBugs.map((n) => n.stepId).join(",")}`,
    );
  }
  const strongParityBugs = adherence.displayNarrationMismatches.filter((p) => p.severity === "strong");
  if (strongParityBugs.length) {
    reasons.push(
      `${strongParityBugs.length} step(s) where displayText omits narration prose: step(s) ${strongParityBugs.map((p) => p.stepId).join(",")}`,
    );
  }
  if (adherence.taggedOperationPct < o.minTaggedOperationPct) {
    reasons.push(
      `taggedOperationPct ${(adherence.taggedOperationPct * 100).toFixed(0)}% < ${(o.minTaggedOperationPct * 100).toFixed(0)}%`,
    );
  }
  if (adherence.compactRate.flaggedOverall) {
    reasons.push(`compactRate ${(adherence.compactRate.overall * 100).toFixed(0)}% > 20%`);
  }
  if (adherence.compactRate.flaggedOperations.length) {
    reasons.push(`over-compact ops: ${adherence.compactRate.flaggedOperations.join(",")}`);
  }
  if (adherence.longestActionRun.length > 6) {
    reasons.push(
      `monotony: ${adherence.longestActionRun.length}-step ${adherence.longestActionRun.type} run (steps ${adherence.longestActionRun.startStepId}–${adherence.longestActionRun.endStepId})`,
    );
  }
  const strongSubViolations = adherence.substitutionPatternViolations.filter(
    (s) => s.severity === "strong",
  );
  if (strongSubViolations.length) {
    reasons.push(
      `${strongSubViolations.length} oversize substitution(s) without animation: step(s) ${strongSubViolations.map((s) => s.stepId).join(",")}`,
    );
  }
  if (adherence.outputContractViolations.length) {
    reasons.push(
      `${adherence.outputContractViolations.length} output-contract violation(s): step(s) ${adherence.outputContractViolations.map((v) => v.stepId).join(",")}`,
    );
  }
  if (adherence.actionShapeViolations.length) {
    reasons.push(
      `${adherence.actionShapeViolations.length} action-shape violation(s): step(s) ${adherence.actionShapeViolations.map((v) => v.stepId).join(",")}`,
    );
  }
  // Conclude presence: the lesson never names its takeaway. Hard fail — a
  // lesson that just trails off is a UX bug regardless of every other
  // metric being clean. Position-agnostic: we accept conclude anywhere
  // (some ideal lessons follow the conclude with a final check_in).
  if (adherence.conclude.missing) {
    reasons.push("lesson is missing a `conclude` step");
  }
  // Word-problem structural enforcement: if any write_text step reads
  // as a word problem in disguise (currency + quantity + named
  // subject heuristic), the model bypassed the typed `word_problem`
  // action and we've lost the layout guarantee. Hard fail — this is
  // the backstop for the structural-prevention work.
  if (adherence.wordProblems.unstructuredCandidates.length) {
    const offenders = adherence.wordProblems.unstructuredCandidates
      .map((c) => `step ${c.stepId} (${c.reasons.join(", ")})`)
      .join("; ");
    reasons.push(
      `${adherence.wordProblems.unstructuredCandidates.length} write_text step(s) read as word problem but skip the structured word_problem action: ${offenders}`,
    );
  }
  // Strong duplicates (character-identical adjacent equations) are a
  // hard fail — the post-collapse pass should have removed them. A
  // single weak near-duplicate is informational; only fail if there
  // are 2+ in one lesson, which signals the model spent multiple
  // beats restating the same equation.
  const strongDupes = adherence.nearDuplicateSteps.filter((d) => d.severity === "strong");
  if (strongDupes.length) {
    reasons.push(
      `${strongDupes.length} duplicate consecutive step pair(s): ${strongDupes.map((d) => `${d.prevStepId}→${d.stepId}`).join(", ")}`,
    );
  }
  const weakDupes = adherence.nearDuplicateSteps.filter((d) => d.severity === "weak");
  if (weakDupes.length >= 2) {
    reasons.push(
      `${weakDupes.length} near-duplicate consecutive step pair(s): ${weakDupes.map((d) => `${d.prevStepId}→${d.stepId}`).join(", ")}`,
    );
  }

  if (math) {
    if (math.equivalenceErrors.length) {
      reasons.push(`${math.equivalenceErrors.length} equivalence error(s)`);
    }
    if (math.fidelityErrors.length) {
      reasons.push(`${math.fidelityErrors.length} fidelity error(s)`);
    }
    if (math.lineErrors.length) {
      reasons.push(`${math.lineErrors.length} coordinate_plane line endpoint error(s)`);
    }
    if (math.unparseableRate > o.maxUnparseableRate) {
      reasons.push(`unparseableRate ${(math.unparseableRate * 100).toFixed(0)}% > ${(o.maxUnparseableRate * 100).toFixed(0)}%`);
    }
  }

  return { pass: reasons.length === 0, reasons };
}
