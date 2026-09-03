# Practice "Correct!" indicator placement

## The bug

When the student answered a practice problem correctly inside the
quiz tutor's practice loop, the "Correct!" pulse rendered inside the
floating practice card panel (under the answer buttons) — not on the
whiteboard canvas the student was actually looking at.

## Where it rendered before

- `PracticePane` (in `practice-whiteboard.tsx`) had an inline motion.div
  with `<Check />` + "Correct!" rendered after the option grid. In the
  quiz tutor flow that pane lives inside `TutorPracticeCard`, a 360px
  floating panel pinned at `fixed top-20 left-6 z-[61]`. The pulse
  appeared in that small panel, not on the full-viewport whiteboard
  canvas behind it.

## Where it renders now

- `PracticePane` exposes a new optional `onRevealedCorrect` callback
  that fires when the student selects the correct option (before the
  1000ms auto-advance). When the callback is supplied, the pane
  suppresses its own inline indicator and lets the parent own the
  feedback visual.
- `TutorPracticeCard` uses `onRevealedCorrect` to mount a viewport-fixed
  overlay (`fixed inset-0 z-[61] pointer-events-none`) that renders a
  centered "Correct!" badge + confetti pulse over the whiteboard canvas
  region. Auto-clears when the next problem mounts.
- `PracticeWhiteboardContent` (used by post-lesson practice and the
  unwired `QuizPracticeLoop`) gets the same overlay positioned over its
  IsoContourFrame canvas.

## Visual pattern matched

Mirrors the in-lesson check-in / predict / fill_blank correct
feedback: spring stiffness 400 / damping 15 scale-in, green Check icon
+ "Correct!" text on a green-tinted backdrop-blur pill, plus the same
14-particle confetti burst used by `CheckInConfetti` in
`micro-lesson.tsx`.

## Divergent path note

The in-lesson practice flow (`micro-lesson.tsx` → `PracticePane`
direct, no `TutorPracticeCard`) does NOT pass `onRevealedCorrect`, so
its behavior is unchanged — it never showed a canvas-level "Correct!"
pulse and still doesn't. Adding one there would be a separate UX call.
