/**
 * Detects whether a student message is a clean confirmation that they
 * understood the tutor's explanation — used to auto-close a chat /
 * tutor-takeover side-quest without round-tripping to the agent.
 *
 * The matcher looks for one of a small set of confirmation phrases that
 * appear in isolation (or with a short polite tail). Anything longer
 * than ~7 words is treated as a real question even if it contains
 * "thanks" — students who type follow-ups often start with politeness.
 *
 * Tuned to be conservative: false negatives (missing a real "got it"
 * and routing it to the agent) are recoverable by the agent answering
 * with "Glad it makes sense!" and then natural close on the NEXT turn.
 * False positives (closing chat when the student wanted more) feel
 * abandoned — much worse. Hence the strict length + phrase matching.
 *
 * Shared by the micro-lesson interaction takeover and the SAT/quiz
 * tutor takeover so the voice "got it" close behaves identically on
 * both surfaces.
 */
export function isCloseIntent(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.!?,]+$/g, "");
  if (!t) return false;
  // Hard cap: anything longer than ~7 words is treated as substantive,
  // even if it leads with "thanks". Closes only on short utterances.
  const wordCount = t.split(/\s+/).length;
  if (wordCount > 7) return false;
  // Whole-phrase matches. Single-word affirmations are listed too —
  // the tutor's closing question ("Make sense?" / "Got it?") makes
  // "yes" / "yeah" / "yep" unambiguous closes in this context. Avoid
  // adding "ok" / "okay" / "sure" because they're commonly used as
  // filler words at the start of follow-up questions
  // ("ok so why does that work?").
  const closeWhole = [
    "yes", "yeah", "yep", "yup", "yea",
    "mhm", "mhmm", "uh huh", "uhhuh",
    "cool", "perfect", "great", "awesome", "nice",
    "got it", "got it thanks", "got it thank you",
    "i got it", "ok got it", "okay got it",
    "thanks", "thank you", "thank you so much",
    "makes sense", "that makes sense", "it makes sense",
    "i understand", "i understand now", "now i understand",
    "i get it", "i get it now", "ok i get it",
    "yep got it", "yeah got it", "yes got it",
    "yes thanks", "yeah thanks", "yep thanks",
    "yes makes sense", "yeah makes sense", "yep makes sense",
    "yes i understand", "yeah i understand",
    "yes i get it", "yeah i get it",
    "cool thanks", "cool got it", "perfect thanks",
    "great thanks", "all good", "all good thanks",
    "no more questions", "no other questions",
    "no further questions", "no thanks im good",
    "im good", "im good thanks", "im all good",
  ];
  if (closeWhole.includes(t)) return true;
  // Loose pattern matches: starts-with "got it" / "thanks" with a
  // short polite tail.
  if (/^(yeah|yep|yes|ok|okay|cool|alright|perfect|great|awesome)[\s,]+(got it|thanks|makes sense|i understand|i get it)\b/.test(t)) {
    return true;
  }
  if (/^(got it|thanks|thank you|makes sense|i understand|i get it)\b[\s,]+(thanks|thank you|cool|great|now|yes|yep|yeah)?$/.test(t)) {
    return true;
  }
  return false;
}
