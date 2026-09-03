# Practice quiz: advance-after-correct fix

## Bug
In the quiz `practice` phase (entered after the student gets a problem
right inside the tutor), the floating `TutorPracticeCard` runs a
2-problem practice loop. On a correct answer the loop "stalled":
"Correct!" rendered, but the surface did not advance to the second
practice problem.

## Root cause
`TutorPracticeCard.handleCorrect` (and the parallel sibling
`QuizPracticeLoop.handleCorrect`) called `onComplete()` immediately on
the FIRST correct answer. `onComplete` exits the practice loop entirely
(`quiz.completePractice()` + `router.push(next quiz problem)`), so the
local 2-problem loop counter (`problemIndex`) was never incremented
from 0 → 1. From the user's perspective, the panel didn't progress
visibly to problem 2; the side effect was a route change instead.

`handleExhausted` already implemented the loop correctly (advance
local index on first slot, only call `onNeedsMicroLesson` when the
loop is done). `handleCorrect` was missing the same two-step gate.

## Pattern matched
`src/components/learning/post-lesson-practice.tsx` —
`handleCorrect` advances the local index, and `onComplete` only fires
when the loop is exhausted (via the `isDone && autoComplete` effect).

## Fix
Both `tutor-practice-card.tsx` and `quiz-practice-loop.tsx` now gate
`onComplete` behind the last-problem check:

```ts
if (problemIndex < problems.length - 1) setProblemIndex(i => i + 1);
else onComplete();
```

Wrong-answer behavior, retry/hint flow, and the
twice-wrong-→-micro-lesson exit are unchanged.

## Before / after
- **Before:** correct on practice 1 → exits practice loop; correct on
  practice 2 never reached.
- **After:** correct on practice 1 → advances to practice 2; correct
  on practice 2 → exits back to the main quiz progression.
