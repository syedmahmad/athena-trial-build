/**
 * Shared types for the micro-lesson evaluator. Kept deliberately lean in v1:
 * adherence + math only. Pedagogy judge is a follow-up once these two tracks
 * are earning their keep.
 */

import type {
  MicroLessonOperation,
  MicroLessonPhase,
  WhiteboardStep,
} from "@/types/whiteboard";

/** Operations that REQUIRE an APPLY/COLLAPSE/STATE triplet (unless compact). */
export const EXPANDING_OPS: ReadonlySet<MicroLessonOperation> = new Set([
  "add",
  "subtract",
  "multiply",
  "divide",
  "substitute",
  "distribute",
  "factor",
  "combine",
]);

/** Operations that stay as a single step. */
export const COMPACT_OPS: ReadonlySet<MicroLessonOperation> = new Set([
  "setup",
  "state",
  "plot",
  "identify",
  "highlight",
  "simplify",
  "conclude",
]);

/** Operations v1 fidelity checks cover. Other expanding ops (distribute,
 *  factor, combine) report fidelity as "not-checkable" in v1. */
export const FIDELITY_CHECKED_OPS: ReadonlySet<MicroLessonOperation> = new Set([
  "add",
  "subtract",
  "multiply",
  "divide",
  "substitute",
]);

// ── Adherence ───────────────────────────────────────────────────────

export type AdherenceMetrics = {
  stepCount: number;
  actionTypeHistogram: Record<string, number>;
  operationHistogram: Record<string, number>;
  /** Teaching steps only (ignores check_in/predict/fill_blank). */
  taggedOperationPct: number;
  taggedLatexPct: number;
  roleHistogram: Record<"op-target" | "op-new" | "op-cancel" | "op-result", number>;
  /** Number of complete APPLY→COLLAPSE→STATE groups (all three phases present, same groupId). */
  tripletCount: number;
  /** Expected triplets (expanding ops not marked compact). */
  expectedTripletCount: number;
  /** Expanding ops with no matching triplet and not marked compact. */
  orphanedExpandingOps: Array<{
    stepId: number;
    operation: MicroLessonOperation;
    reason: string;
  }>;
  /** Non-enum values found on `operation` fields. */
  invalidOperations: Array<{ stepId: number; value: string }>;
  /** Broken triplets: groupId used but missing phases, or phases out of order. */
  brokenTriplets: Array<{
    groupId: string;
    stepIds: number[];
    reason: string;
  }>;
  /**
   * Interaction steps (check_in/predict/fill_blank) whose narration reads
   * like the answer/explanation rather than the question. Severity is
   * "strong" when narration contains the literal correct answer text and
   * "weak" when it doesn't read as a question (no question word, no ?)
   * while the step's question does. Weak flags are informational; strong
   * flags fail the acceptance gate.
   */
  suspiciousNarrations: Array<{
    stepId: number;
    severity: "strong" | "weak";
    narration: string;
    reason: string;
  }>;
  /**
   * Teaching steps whose displayText doesn't carry the prose content of the
   * narration. The student SEES displayText while HEARING narration; if
   * narration introduces ideas/words that displayText omits, the visible
   * panel feels out of sync with the voice. Flagged when narration has
   * meaningful prose tokens that don't appear in displayText (after LaTeX
   * is stripped). Severity is "strong" when displayText has no prose at
   * all (pure math) and narration has substantial prose; "weak" when prose
   * is present but missing several tokens.
   */
  displayNarrationMismatches: Array<{
    stepId: number;
    severity: "strong" | "weak";
    missingTokens: string[];
    reason: string;
  }>;
  /**
   * Longest consecutive run of the same action.type across teaching steps.
   * Long runs of write_math signal canvas monotony — students disengage
   * when the panel evolves with no visual change-up. Counts only teaching
   * steps (interactions inherently break the run).
   */
  longestActionRun: {
    type: string;
    length: number;
    startStepId: number;
    endStepId: number;
  };
  /**
   * Action runs that exceeded the soft cap (4). Each entry is a flagged
   * stretch of consecutive teaching steps sharing the same action.type.
   */
  monotonyRuns: Array<{
    type: string;
    length: number;
    startStepId: number;
    endStepId: number;
  }>;
  /**
   * Substitute apply steps where the substitution count doesn't match
   * the prescribed visual pattern: 2+ variables substituted in a single
   * step without a `flyInSubstitution` (strong — values must arc in
   * from their source step), or 1 substitution with no `incomingArrow`
   * (or `flyInSubstitution`) for src→dst continuity (weak).
   */
  substitutionPatternViolations: Array<{
    stepId: number;
    severity: "strong" | "weak";
    substitutionCount: number;
    reason: string;
  }>;
  /**
   * Per-step violations of the displayText / narration output
   * contract: unbalanced `$`, bare LaTeX commands outside math,
   * bare `$<digit>` currency, `$`/`\`/`{}` in narration, etc. The
   * UI renderers trust these fields verbatim, so violations show up
   * as raw LaTeX or mangled prose in the student's view.
   */
  outputContractViolations: Array<{
    stepId: number;
    field: "displayText" | "narration" | "both";
    reasons: string[];
  }>;
  /**
   * Pairs of consecutive teaching steps whose displayed math content is
   * the same (or near-identical). Triplet phase chains within the same
   * operationGroupId are excluded — those legitimately morph the same
   * equation in place. The remaining flags are duplicates the model or
   * critic should collapse: e.g. a `state` immediately followed by an
   * unphased `write_math` of the same final form, or two consecutive
   * `state` steps with no intervening op. Severity: "strong" when the
   * normalized LaTeX is character-identical, "weak" when bigram Jaccard
   * ≥ 0.92.
   */
  nearDuplicateSteps: Array<{
    prevStepId: number;
    stepId: number;
    severity: "strong" | "weak";
    similarity: number;
    reason: string;
  }>;
  /**
   * Steps whose `orbFocus.part` (the roaming orb's pointing target) does not
   * resolve against the geometry shape it references — a dangling pointer: the
   * orb would have nothing to walk to. Either the referenced shape isn't a
   * visible geometry step, or the part name isn't a vertex/side/label on it.
   */
  danglingOrbFocus: Array<{
    stepId: number;
    part: string;
    reason: string;
  }>;
  /**
   * Per-step violations of the action object's structural contract:
   * a `coordinate_plane` element of type `point` missing `at`, a
   * `line` missing `from`/`to`, an interaction missing `question`,
   * a multiple-choice `correctOption` out of range, etc. The renderer
   * crashes on these; the eval needs to flag them before the lesson
   * ships. Each violation describes the shape mismatch precisely so
   * a self-critique pass can correct it.
   */
  actionShapeViolations: Array<{
    stepId: number;
    actionType: string;
    reasons: string[];
  }>;
  compactRate: {
    overall: number;
    byOperation: Partial<Record<MicroLessonOperation, number>>;
    flaggedOverall: boolean;
    flaggedOperations: MicroLessonOperation[];
  };
  /**
   * Whether the lesson includes at least one step with `operation === "conclude"`.
   * A conclude step is the lesson's takeaway / final answer beat — without it
   * the lesson trails off rather than landing the point. Ideal lessons all
   * carry one or more conclude beats; ~23% of lessons in the c2-ir-crit
   * matrix omit them entirely. Counts every conclude step found and exposes
   * the IDs so the critic / dev sidebar can jump to the missing beat.
   */
  conclude: {
    /** Total number of steps with operation === "conclude". */
    count: number;
    /** Step IDs of all conclude steps (empty when count === 0). */
    stepIds: number[];
    /** True when no conclude step is present. Hard-fails the accept gate. */
    missing: boolean;
  };
  /**
   * Section-heading presence. SOFT signal in v1: presence is informational
   * and contributes a small score nudge, but does NOT trip the accept gate.
   * A real lesson should mark its phases (TEACH / VERIFY / ASSESS, or
   * similar) with at least 2 `section_heading` action steps so the student
   * has visual chunking to anchor onto. Once ideal-lessons + the prompt
   * pipeline reliably emit section headings, the gate flips to hard-fail.
   */
  sectionHeadings: {
    count: number;
    stepIds: number[];
    /** True when count < 2. Informational only — no gate. */
    sparse: boolean;
  };
  /**
   * Word-problem structural enforcement. The typed `word_problem`
   * action carries the canonical prose/variables/equation triple so a
   * single renderer owns the layout. Detects two failure modes:
   *
   * 1. `count` — how many structured word_problem actions are present.
   *    Informational; some lessons have none (pure algebra).
   *
   * 2. `unstructuredCandidates` — `write_text` steps whose content
   *    reads as a word problem (currency / "how many" / quantitative
   *    nouns + named-subject) but were authored as raw prose instead
   *    of the structured action. These bypass the typed contract;
   *    flagging them is the backstop for the structural-prevention
   *    work. Strong signal → hard accept-gate fail.
   */
  wordProblems: {
    count: number;
    stepIds: number[];
    unstructuredCandidates: Array<{
      stepId: number;
      excerpt: string;
      reasons: string[];
    }>;
  };
  /** Convenience: 0..1. 1 = perfect adherence, 0 = hopeless. */
  score: number;
};

// ── Math correctness ─────────────────────────────────────────────────

export type EquivalenceError = {
  stepId: number;
  claim: string;
  exprBefore: string | null;
  exprAfter: string | null;
  reason: string;
};

export type FidelityError = {
  stepId: number;
  operation: MicroLessonOperation;
  operand?: string;
  exprBefore: string | null;
  exprAfter: string | null;
  reason: string;
};

/** A `coordinate_plane` line element whose endpoint(s) don't actually
 *  satisfy the equation in its `label`. Surfaces real plotting bugs
 *  (e.g. label "x - y = 1" but from/to coordinates plot a different
 *  line). */
export type LineFidelityError = {
  stepId: number;
  elementIndex: number;
  equation: string;
  point: [number, number];
  endpoint: "from" | "to";
  residual: number;
};

export type MathMetrics = {
  /** Count of write_math steps we had checkable expr fields for. */
  checkableCount: number;
  /** Count of write_math steps we skipped (non-equation, parse failure, etc). */
  unparseableCount: number;
  unparseableRate: number;
  equivalenceErrors: EquivalenceError[];
  fidelityErrors: FidelityError[];
  /** coordinate_plane line endpoints that don't satisfy their label equation. */
  lineErrors: LineFidelityError[];
  /** Operations present in v1 fidelity-checked set. */
  fidelityCheckedOps: MicroLessonOperation[];
  /** Operations present that we skipped fidelity on (in v1). */
  fidelitySkippedOps: MicroLessonOperation[];
  score: number; // 1 if no errors; scales down with error count.
};

// ── Combined ────────────────────────────────────────────────────────

export type LessonReport = {
  lessonId?: string;
  topicSlug?: string;
  subtopicSlug?: string;
  variant?: string;
  adherence: AdherenceMetrics;
  math: MathMetrics | null;
  /** Overall pass/fail against Phase 5 gates (see evaluator-accept). */
  accept: {
    pass: boolean;
    reasons: string[];
  };
};

export type { WhiteboardStep, MicroLessonOperation, MicroLessonPhase };
