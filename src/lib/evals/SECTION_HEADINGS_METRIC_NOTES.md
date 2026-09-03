# Section Headings — Evaluator Metric

Soft signal in v1. Tracks `section_heading` step presence both as a
count and per-step IDs. Reports `sparse: true` when count < 2 (a
real lesson should mark at least TEACH/ASSESS, ideally TEACH/VERIFY/
ASSESS). Today this is informational + a small score nudge; once
the prompt + IR pipeline reliably emit headings, the gate flips to
hard-fail in `accept.ts`.

## What was added

- `AdherenceMetrics.sectionHeadings: { count; stepIds; sparse }` in
  `types.ts`.
- Single-pass count in `evaluateAdherence` (`adherence.ts`) over
  `step.action?.type === "section_heading"`.
- Score penalty: 0.04 when count === 0, 0.02 when count === 1, 0
  otherwise. Capped at 0.04.
- `summarizeAdherence` appends `${count} section heading(s)` when
  sparse.
- New fixture `__fixtures__/sparse-section-headings.json` (1 heading
  → exercises `sparse: true`).
- `good-linear-one-var.json` expectation extended with
  `sectionHeadingsCount: 0, sectionHeadingsSparse: true` — intentional;
  flips to false when the parallel ideal-lesson + prompt work lands.
- NO change to `accept.ts` — soft signal only.

## Counts in current data

- Ideal lessons (already updated by parallel work in flight):
  algebra-linear-1v=3, algebra-linear-2v=4, polynomial-ops=3. None
  sparse, all still PASS the accept gate.
- Matrix `c2-ir-crit` (30 lessons): histogram `{0: 30}` — every
  matrix-generated lesson has zero section headings.

## When to flip the gate

Once the prompt / agent updates have shipped and a fresh matrix run
shows `sparse=false` on the majority (>= ~80%) of lessons, change
`accept.ts` to push a reason when `sectionHeadings.sparse` is true.
The fixture expectation on `good-linear-one-var.json` should flip
to `sectionHeadingsSparse: false` at the same time (and the fixture
itself updated to include 2+ section_headings).
