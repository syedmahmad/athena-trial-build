/**
 * Evaluator unit tests. Runs adherence + math against hand-authored fixtures
 * in this directory and asserts each evaluator produces the expected verdict.
 *
 * Run: npx tsx --env-file=.env src/lib/evals/__fixtures__/run-tests.ts
 *   or: make eval-test
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  evaluateAdherence,
  evaluateMath,
  type WhiteboardStep,
} from "..";

type Expectation = {
  file: string;
  description: string;
  adherence: {
    passesAllChecks?: boolean;
    expectedTripletCount?: number;
    tripletCount?: number;
    invalidOperations?: number;
    orphanedExpandingOps?: number;
    brokenTriplets?: number;
    compactFlaggedOverall?: boolean;
    suspiciousStrong?: number;
    suspiciousWeak?: number;
    longestRunAtLeast?: number;
    monotonyRunsAtLeast?: number;
    substitutionStrongAtLeast?: number;
    substitutionWeakAtLeast?: number;
    outputContractViolationsAtLeast?: number;
    nearDuplicateStrong?: number;
    nearDuplicateWeak?: number;
    concludeMissing?: boolean;
    concludeCountAtLeast?: number;
    sectionHeadingsCount?: number;
    sectionHeadingsSparse?: boolean;
  };
  math?: {
    equivalenceErrors?: number;
    fidelityErrors?: number;
    checkableCountAtLeast?: number;
  };
};

const FIXTURES: Expectation[] = [
  {
    file: "good-linear-one-var.json",
    description: "Clean 2x+3=7 solve — should pass everything (section_headings still sparse pre-prompt-update)",
    adherence: {
      passesAllChecks: true,
      expectedTripletCount: 2,
      tripletCount: 2,
      invalidOperations: 0,
      orphanedExpandingOps: 0,
      brokenTriplets: 0,
      compactFlaggedOverall: false,
      concludeMissing: false,
      concludeCountAtLeast: 1,
      sectionHeadingsCount: 0,
      sectionHeadingsSparse: true,
    },
    math: { equivalenceErrors: 0, fidelityErrors: 0, checkableCountAtLeast: 4 },
  },
  {
    file: "sparse-section-headings.json",
    description: "Lesson with only 1 section_heading — sparse:true, count=1, soft signal only",
    adherence: {
      sectionHeadingsCount: 1,
      sectionHeadingsSparse: true,
      tripletCount: 2,
      expectedTripletCount: 2,
      concludeMissing: false,
    },
  },
  {
    file: "missing-conclude.json",
    description: "Lesson trails off without a `conclude` operation — must flag",
    adherence: {
      concludeMissing: true,
      tripletCount: 2,
      expectedTripletCount: 2,
    },
  },
  {
    file: "missing-collapse.json",
    description: "APPLY then STATE, no COLLAPSE — adherence should detect broken triplet",
    adherence: {
      tripletCount: 0,
      brokenTriplets: 1,
      expectedTripletCount: 1,
    },
  },
  {
    file: "mislabeled-operation.json",
    description: "Labeled 'subtract 3' but actually divided — fidelity must catch",
    adherence: { tripletCount: 1 },
    math: { fidelityErrors: 1 },
  },
  {
    file: "mathematically-wrong.json",
    description: "7-3=5 — equivalence check must flag the collapse",
    adherence: { tripletCount: 1 },
    math: { equivalenceErrors: 1 },
  },
  {
    file: "overused-compact.json",
    description: "All expanding ops marked compact — compactRate flag fires",
    adherence: {
      compactFlaggedOverall: true,
      tripletCount: 0,
      expectedTripletCount: 0,
    },
  },
  {
    file: "non-equation-write-math.json",
    description: "Formulas/definitions — no triplets expected, no false positives",
    adherence: { tripletCount: 0, expectedTripletCount: 0, orphanedExpandingOps: 0 },
    math: { equivalenceErrors: 0, fidelityErrors: 0 },
  },
  {
    file: "notation-heavy-geometry.json",
    description: "Geometry — pattern should not fire",
    adherence: { tripletCount: 0, expectedTripletCount: 0, orphanedExpandingOps: 0 },
  },
  {
    file: "invalid-operation.json",
    description: "Unknown operation value — must be flagged",
    adherence: { invalidOperations: 1 },
  },
  {
    file: "answer-leaking-narration.json",
    description: "Interaction narrations that state the answer — must be caught",
    adherence: { suspiciousStrong: 2 },
  },
  {
    file: "long-write-math-run.json",
    description: "8 consecutive write_math steps — monotony check must flag the run",
    adherence: { longestRunAtLeast: 8, monotonyRunsAtLeast: 1 },
  },
  {
    file: "oversized-substitution.json",
    description: "4 substitutions in one apply step without flyInSubstitution — must flag strong",
    adherence: { substitutionStrongAtLeast: 1 },
  },
  {
    file: "output-contract-violations.json",
    description: "Bare currency, \\textcolor outside math, unbalanced $, \\$ in narration — must flag",
    adherence: { outputContractViolationsAtLeast: 3 },
  },
  {
    file: "near-duplicate-steps.json",
    description: "Two unphased write_math steps with identical equations → strong duplicate; triplet-internal phase repeats are exempt",
    adherence: { nearDuplicateStrong: 2 },
  },
];

function red(s: string) { return `\x1b[31m${s}\x1b[0m`; }
function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }

async function main() {
  const fixturesDir = dirname(fileURLToPath(import.meta.url));
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const fx of FIXTURES) {
    const raw = readFileSync(join(fixturesDir, fx.file), "utf8");
    const steps = JSON.parse(raw) as WhiteboardStep[];
    const adherence = evaluateAdherence(steps);
    let math;
    if (fx.math) {
      math = await evaluateMath(steps);
    }
    const errors: string[] = [];

    const a = fx.adherence;
    if (a.expectedTripletCount !== undefined && adherence.expectedTripletCount !== a.expectedTripletCount) {
      errors.push(`expectedTripletCount: want ${a.expectedTripletCount}, got ${adherence.expectedTripletCount}`);
    }
    if (a.tripletCount !== undefined && adherence.tripletCount !== a.tripletCount) {
      errors.push(`tripletCount: want ${a.tripletCount}, got ${adherence.tripletCount}`);
    }
    if (a.invalidOperations !== undefined && adherence.invalidOperations.length !== a.invalidOperations) {
      errors.push(`invalidOperations: want ${a.invalidOperations}, got ${adherence.invalidOperations.length}`);
    }
    if (a.orphanedExpandingOps !== undefined && adherence.orphanedExpandingOps.length !== a.orphanedExpandingOps) {
      errors.push(`orphanedExpandingOps: want ${a.orphanedExpandingOps}, got ${adherence.orphanedExpandingOps.length}`);
    }
    if (a.brokenTriplets !== undefined && adherence.brokenTriplets.length !== a.brokenTriplets) {
      errors.push(`brokenTriplets: want ${a.brokenTriplets}, got ${adherence.brokenTriplets.length}`);
    }
    if (a.compactFlaggedOverall !== undefined && adherence.compactRate.flaggedOverall !== a.compactFlaggedOverall) {
      errors.push(`compactFlaggedOverall: want ${a.compactFlaggedOverall}, got ${adherence.compactRate.flaggedOverall}`);
    }
    if (a.suspiciousStrong !== undefined) {
      const got = adherence.suspiciousNarrations.filter((n) => n.severity === "strong").length;
      if (got !== a.suspiciousStrong) {
        errors.push(`suspiciousStrong: want ${a.suspiciousStrong}, got ${got}`);
      }
    }
    if (a.suspiciousWeak !== undefined) {
      const got = adherence.suspiciousNarrations.filter((n) => n.severity === "weak").length;
      if (got !== a.suspiciousWeak) {
        errors.push(`suspiciousWeak: want ${a.suspiciousWeak}, got ${got}`);
      }
    }
    if (a.longestRunAtLeast !== undefined && adherence.longestActionRun.length < a.longestRunAtLeast) {
      errors.push(`longestActionRun.length: want ≥ ${a.longestRunAtLeast}, got ${adherence.longestActionRun.length}`);
    }
    if (a.monotonyRunsAtLeast !== undefined && adherence.monotonyRuns.length < a.monotonyRunsAtLeast) {
      errors.push(`monotonyRuns.length: want ≥ ${a.monotonyRunsAtLeast}, got ${adherence.monotonyRuns.length}`);
    }
    if (a.substitutionStrongAtLeast !== undefined) {
      const got = adherence.substitutionPatternViolations.filter((s) => s.severity === "strong").length;
      if (got < a.substitutionStrongAtLeast) {
        errors.push(`substitution strong violations: want ≥ ${a.substitutionStrongAtLeast}, got ${got}`);
      }
    }
    if (a.substitutionWeakAtLeast !== undefined) {
      const got = adherence.substitutionPatternViolations.filter((s) => s.severity === "weak").length;
      if (got < a.substitutionWeakAtLeast) {
        errors.push(`substitution weak violations: want ≥ ${a.substitutionWeakAtLeast}, got ${got}`);
      }
    }
    if (a.outputContractViolationsAtLeast !== undefined) {
      const got = adherence.outputContractViolations.length;
      if (got < a.outputContractViolationsAtLeast) {
        errors.push(`outputContractViolations: want ≥ ${a.outputContractViolationsAtLeast}, got ${got}`);
      }
    }
    if (a.nearDuplicateStrong !== undefined) {
      const got = adherence.nearDuplicateSteps.filter((d) => d.severity === "strong").length;
      if (got !== a.nearDuplicateStrong) {
        errors.push(`nearDuplicateStrong: want ${a.nearDuplicateStrong}, got ${got}`);
      }
    }
    if (a.nearDuplicateWeak !== undefined) {
      const got = adherence.nearDuplicateSteps.filter((d) => d.severity === "weak").length;
      if (got !== a.nearDuplicateWeak) {
        errors.push(`nearDuplicateWeak: want ${a.nearDuplicateWeak}, got ${got}`);
      }
    }
    if (a.concludeMissing !== undefined && adherence.conclude.missing !== a.concludeMissing) {
      errors.push(`conclude.missing: want ${a.concludeMissing}, got ${adherence.conclude.missing}`);
    }
    if (a.concludeCountAtLeast !== undefined && adherence.conclude.count < a.concludeCountAtLeast) {
      errors.push(`conclude.count: want ≥ ${a.concludeCountAtLeast}, got ${adherence.conclude.count}`);
    }
    if (a.sectionHeadingsCount !== undefined && adherence.sectionHeadings.count !== a.sectionHeadingsCount) {
      errors.push(`sectionHeadings.count: want ${a.sectionHeadingsCount}, got ${adherence.sectionHeadings.count}`);
    }
    if (a.sectionHeadingsSparse !== undefined && adherence.sectionHeadings.sparse !== a.sectionHeadingsSparse) {
      errors.push(`sectionHeadings.sparse: want ${a.sectionHeadingsSparse}, got ${adherence.sectionHeadings.sparse}`);
    }
    if (a.passesAllChecks) {
      if (adherence.orphanedExpandingOps.length) errors.push("passesAllChecks expected but orphaned ops present");
      if (adherence.brokenTriplets.length) errors.push("passesAllChecks expected but brokenTriplets present");
      if (adherence.invalidOperations.length) errors.push("passesAllChecks expected but invalidOperations present");
      if (adherence.conclude.missing) errors.push("passesAllChecks expected but conclude is missing");
    }

    if (math && fx.math) {
      if (fx.math.equivalenceErrors !== undefined && math.equivalenceErrors.length !== fx.math.equivalenceErrors) {
        errors.push(`equivalenceErrors: want ${fx.math.equivalenceErrors}, got ${math.equivalenceErrors.length}`);
      }
      if (fx.math.fidelityErrors !== undefined && math.fidelityErrors.length !== fx.math.fidelityErrors) {
        errors.push(`fidelityErrors: want ${fx.math.fidelityErrors}, got ${math.fidelityErrors.length}`);
      }
      if (fx.math.checkableCountAtLeast !== undefined && math.checkableCount < fx.math.checkableCountAtLeast) {
        errors.push(`checkableCount: want at least ${fx.math.checkableCountAtLeast}, got ${math.checkableCount}`);
      }
    }

    if (errors.length === 0) {
      console.log(`${green("PASS")}  ${fx.file}  — ${fx.description}`);
      passed++;
    } else {
      console.log(`${red("FAIL")}  ${fx.file}  — ${fx.description}`);
      for (const e of errors) console.log(`         ${e}`);
      failures.push(fx.file);
      failed++;
    }
  }

  console.log(`\n${passed}/${passed + failed} fixtures passed`);
  if (failed) {
    console.log(`failed: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
