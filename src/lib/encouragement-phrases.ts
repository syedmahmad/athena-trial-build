/**
 * Voice-coach phrases used after correct / wrong answers across the
 * learning surfaces (micro-lesson interactions, SAT-quiz takeover, and
 * any future surface that needs the same tone). Sharing them here keeps
 * the cadence consistent — the student hears the same voice whether
 * they're inside a micro-lesson or pressing "Got it" on a quiz.
 *
 * Phrases are short (≤ 1 sentence each) and intentionally non-judgmental
 * on the wrong path: no negative SFX should accompany them — the spoken
 * line carries the cue. See `micro-lesson.tsx`'s "No negative SFX; the
 * encouragement narration carries the cue" comments for the rationale.
 */

export const CORRECT_PHRASES = [
  "That's right. Let's move on.",
  "Great work. Let's move on.",
  "You got it. Moving on.",
  "Nicely done. Let's keep going.",
  "Exactly right. Onward.",
  "Perfect. Let's continue.",
  "Spot on. Let's keep going.",
  "That's it. Moving on.",
  "Well done. Let's continue.",
  "Yes, that's right. Onward.",
];

export const ENCOURAGEMENT_PHRASES = [
  "No worries, we'll come back to this. Let's move on.",
  "That's a tricky one — we'll review this together later.",
  "You're learning. Let's keep going.",
  "Good effort. Let's try the next one.",
  "We'll spend more time on this later.",
  "Don't worry, this one's a bit tricky. Moving on.",
  "Keep at it. Let's continue.",
  "You're making progress. Let's keep moving.",
  "We'll revisit this. Onward.",
  "It's okay, this one was tough. Let's continue.",
];

export function pickCorrectPhrase(): string {
  return CORRECT_PHRASES[Math.floor(Math.random() * CORRECT_PHRASES.length)];
}

export function pickEncouragementPhrase(): string {
  return ENCOURAGEMENT_PHRASES[
    Math.floor(Math.random() * ENCOURAGEMENT_PHRASES.length)
  ];
}
