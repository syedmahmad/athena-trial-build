# Section Headings — Insertion Notes

Section_heading steps were missing from the three hand-authored ideal
lessons. They model the visible chapter markers the c2-ir generator
should emit and the evaluator anchors on. Each heading carries a short
visual `text`, a TTS `narration` (no math, no leaks), and the standard
step envelope (`id`, `delayMs: 0`, `durationMs: 600`, `displayText` =
text). No `operation` / `operationGroupId` — these aren't teaching
steps.

## Per-lesson summary

| Lesson | Headings added | Before → After step count |
|---|---|---|
| algebra-linear-equations-one-variable | 3 | 34 → 37 |
| algebra-linear-equations-two-variables | 4 | 51 → 55 |
| advanced-math-polynomial-operations | 3 | 23 → 26 |

## Boundary logic

Headings were placed where the lesson naturally pivots from one
sub-skill / scenario to the next, *not* at fixed positions. After
insertion, all `id` fields were renumbered contiguously and every
`highlight.targetStepId` was shifted to the new ids.

- **algebra-linear-equations-one-variable** — (1) before the
  introduction of $ax + b = c$, (2) before solving the worked
  example $3x + 5 = 14$, (3) before the parentheses example
  $2(x + 3) = 14$.
- **algebra-linear-equations-two-variables** — (1) slope-intercept
  intro, (2) finding x and y intercepts, (3) the slope formula,
  (4) point-slope form. Four sections because the lesson genuinely
  covers four distinct sub-skills.
- **advanced-math-polynomial-operations** — (1) intro to multiplying
  binomials and FOIL, (2) the worked $(x+3)(x+2)$ expansion, (3) the
  area-model visualization.

## Verification

All three lessons still PASS the accept gate after the inserts. The
fixture suite (`run-tests.ts`) remains 14/14 green. Adherence scores
stayed at or near their previous levels (0.81–0.89).
