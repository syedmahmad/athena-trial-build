import type { CachedReportPayload } from "../types";

export const microLessonDemo: CachedReportPayload = {
  kind: "micro-lesson",
  userId: "demo-user",
  generatedAt: "2026-05-23T19:02:00.000Z",
  aggregates: {
    sessionId: "demo-mls",
    topicName: "Algebra",
    subtopicName: "Distributive Property",
    durationSeconds: 9 * 60 + 18,
    stepsViewed: 22,
    totalSteps: 24,
    checkinsCorrect: 4,
    checkinsTotal: 5,
    chatMessageCount: 6,
    completed: true,
    createdAt: "2026-05-23T19:02:00.000Z",
    skill: { level: 4, xp: 820, streakCorrect: 2, streakWrong: 0 },
  },
  snapshot: {
    topicName: "Algebra",
    subtopicName: "Distributive Property",
    learningObjectives: [
      "Apply a(b + c) = ab + ac in both directions",
      "Recognize when to distribute vs factor",
      "Handle negative coefficients without sign errors",
    ],
    keyFormulas: [
      { latex: "a(b+c) = ab + ac", description: "The distributive property" },
      { latex: "-(a+b) = -a - b", description: "Distributing a negative" },
    ],
    chatMessages: [
      { role: "user", content: "Why does the negative flip both signs?" },
      { role: "tutor", content: "Because -1 multiplies each term: -(a+b) = -1·a + -1·b = -a - b." },
      { role: "user", content: "Oh — so the parentheses are basically a multiplier." },
      { role: "tutor", content: "Exactly. Whenever you see a number or sign in front of (...), it distributes to every term inside." },
    ],
    perStepAttempts: [
      { stepIndex: 5, kind: "check_in", wrongCount: 0, hintReached: "none", tutorEntered: false },
      { stepIndex: 9, kind: "predict", wrongCount: 1, hintReached: "hinted", tutorEntered: false },
      { stepIndex: 14, kind: "fill_blank", wrongCount: 2, hintReached: "detailed", tutorEntered: true },
      { stepIndex: 18, kind: "check_in", wrongCount: 0, hintReached: "none", tutorEntered: false },
      { stepIndex: 21, kind: "predict", wrongCount: 0, hintReached: "none", tutorEntered: false },
    ],
    stepTimings: [
      { stepIndex: 5, responseMs: 8_400 },
      { stepIndex: 9, responseMs: 19_200 },
      { stepIndex: 14, responseMs: 42_500 },
      { stepIndex: 18, responseMs: 6_300 },
      { stepIndex: 21, responseMs: 11_100 },
    ],
  },
  analysis: {
    headline: "Distributive logic is clicking",
    scoreContext: "4 of 5 check-ins right and a focused tutor side-quest on the trickiest one.",
    strengths: [
      { icon: "brain", label: "Grasped the rule directly", detail: "First two check-ins were instant correct." },
      { icon: "message-circle-question", label: "Asked the right question", detail: "Pinpointed why the negative flips both signs." },
      { icon: "book-open", label: "Connected to a multiplier", detail: "Parentheses-as-multiplier insight will transfer." },
    ],
    growthAreas: [
      { icon: "alert-triangle", label: "Sign flips on negatives", detail: "Two wrong attempts on -(a+b) before it landed." },
      { icon: "clock", label: "Hesitation on fill-blanks", detail: "42s on the only fill-blank — slow down to set it up." },
      { icon: "compass", label: "Spot factoring as the reverse", detail: "Try problems that go ab + ac → a(b+c)." },
    ],
    speedInsight: "Quick on multiple-choice, slow on free-response — the gap is set-up confidence.",
    nextStepSuggestion: "Try the 'Factoring out a Common Term' lesson — it's the reverse direction.",
  },
};
