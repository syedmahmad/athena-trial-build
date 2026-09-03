# Phase F evaluator notes

## What was added

**`missingConclude` gate.** A lesson must contain at least one step with
`operation === "conclude"`. The check is position-agnostic — some ideal
lessons follow the conclude beat with a final practice interaction
(`check_in` / `fill_blank`), so requiring conclude as the *last* step
would falsely flag them. We only fail when zero conclude steps exist.

The gate emits a single human-readable reason
("lesson is missing a `conclude` step") and the new
`adherence.conclude` block exposes `count` and `stepIds` so the dev
sidebar can jump to (or note the absence of) the takeaway beat.

## Why this gate (and not the others)

The Phase plan listed three candidates; the matrix data picked one:

- **`interactionDensity`** — *skipped*. Every c2-ir-crit lesson already
  emits exactly 6 interactions, so global counts don't differentiate.
  Max consecutive teaching-step runs hit 19 in one ideal lesson (a
  legitimate multi-triplet worked example), but only 16 in the worst
  matrix lesson, so any threshold safe for ideals is dead code in the
  matrix today. Revisit when matrix runs span less narrow ground.
- **`missingConclude`** — *added*. 7/30 (23%) of c2-ir-crit lessons
  emit zero conclude steps. All three ideal lessons carry 2–4. Cleanest
  signal in the matrix.
- **`conceptualScaffoldingCoverage`** — *skipped*. Scoring-only metric;
  Phase F asked for gates.

## Real-matrix impact

`.local/evals/c2-ir-crit` (30 lessons): pass-rate 14/30 → 10/30. The
gate newly fails **4** lessons that were previously passing
(linear-functions iters 1 & 3, linear-inequalities iters 2 & 3, etc.
the rest were already failing on other gates). 7 lessons in total trip
the new gate.

`.local/evals/collapse-validation` (6 lessons): unchanged — every
lesson there already emits a conclude step.

## Ideal-lesson regression check

All three ideal lessons (`advanced-math-polynomial-operations`,
`algebra-linear-equations-one-variable`, `algebra-linear-equations-two-variables`)
still PASS the evaluator. Each carries ≥2 conclude steps.

## Fixture suite

Added `__fixtures__/missing-conclude.json` (final step downgraded from
`conclude` to plain `state` — otherwise identical to the
known-good `good-linear-one-var.json`). The runner now asserts both
`conclude.missing` and `conclude.count ≥ 1` on the relevant fixtures
and threads `conclude.missing` into the `passesAllChecks` invariant.

Suite: 14/14 green.
