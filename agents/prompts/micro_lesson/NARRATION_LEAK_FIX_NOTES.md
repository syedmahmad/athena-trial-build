# Narration leak fix — 2026-05-01

## What broke
On `algebra/linear-equations-two-variables`, the c2-ir + tool-use + self-critique
matrix produced strong narration leaks at interaction steps (`check_in` /
`predict` / `fill_blank`): the model wrote the answer + reasoning into the
`narration` field instead of just the bare question. The evaluator's
`suspiciousNarrations` strong-leak gate fails any such step.

Sample failure (`c2-ir-crit/.../iter-3/lesson.json` step 17):
> "The slope of the line 3 x plus 2 y equals 8 is negative three-halves
> because after dividing every term by 2, the coefficient of x becomes
> negative three-halves."

Three contract violations in one sentence: literal answer text twice
(`negative three-halves`), explanation marker (`because`), and full
solution path (`after dividing every term by 2`).

## What changed

1. **`agents/prompts/micro_lesson/c2-ir.md`** — `<interaction_narration_contract>`
   block expanded with an explicit ABSOLUTE BANS list (no `because/since/
   therefore/thus/hence`, no literal-answer text, no solution-path clauses,
   no fact assertions) and two new wrong-vs-right examples drawn from the
   real failure (the "negative three-halves" leak and a phonetic-paraphrase
   leak).
2. **`agents/app/run_time/sat/micro_lesson_agent.py`** `_CRITIQUE_INSTRUCTIONS`
   rule #1 — rewritten with hard requirements (a)-(f), explicit answer-source
   extraction recipe (`acceptedAnswers[0]` / `options[correctOption]`),
   phonetic-paraphrase ban, and a verbatim before/after rewrite example.
3. **New deterministic sanitizer** — `_sanitize_interaction_narrations()` runs
   after the LLM critique pass, mirrors the evaluator's strong-leak heuristics
   (literal-answer match, explanation-marker without question-shape,
   non-question-shaped on interaction steps), and rewrites violators to a
   bare interrogative derived from `action.question`. Logs each rewrite to
   stderr.

## Validation (3 fresh iters, `algebra/linear-equations-two-variables`)

```
.local/evals/fix-validation/algebra/linear-equations-two-variables/
  iter-0: ACCEPT  · 0 strong leaks · 0 weak leaks
  iter-1: REJECT (missing conclude step) · 0 strong leaks · 2 weak leaks
  iter-2: REJECT (missing conclude + equivalence) · 0 strong leaks · 0 weak leaks
```

**Strong narration leaks: 0/3 (target hit).** Pre-fix baseline on the same
subtopic (`c2-ir-crit/.../iter-3`) had a strong leak at step 17. Pre-fix
matrix had 1/5 strong-leak rejections; this run is 0/3.

Accept-gate pass rate is 1/3 — the remaining failures are unrelated
(missing-`conclude`-step rule and math-equivalence errors). All narration
content rejection was eliminated.

## Eval suite still green
- 14/14 evaluator fixtures pass (`src/lib/evals/__fixtures__/run-tests.ts`).
- Ideal lesson still ACCEPTs (`.local/check-ideal-accept.ts`).
