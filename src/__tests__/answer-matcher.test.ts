import { describe, expect, it } from "vitest";
import { cleanTranscript } from "@/lib/voice/transcript-filters";
import { looksLikeQuestionOrComment, matchByRegex } from "@/lib/voice/answer-matcher";

/**
 * Regression guards for the regex answer-matcher + question-shape
 * pre-filter. Both layers are sync, pure functions — the LLM judge
 * (matchByLLM) is intentionally not tested here since it depends on
 * a live network endpoint.
 *
 * Background bug this file pins: an STT transcript like
 * "Add four to both sides (instrumental music plays)." for an option
 * whose text was "add 4 to both sides" was:
 *   - tagged question-shaped by looksLikeQuestionOrComment (8 words
 *     including the parenthetical → trips the >6-word gate)
 *   - so the matcher was bypassed entirely
 *   - then chat dispatch had its own failure mode (silent or stuck)
 * Fix landed: dispatchVoiceUtterance now runs cleanTranscript on the
 * raw STT output before any downstream routing, so the parenthetical
 * is stripped (6 words → not question-shaped → matcher runs and
 * directly matches the option).
 *
 * The tests below pin the end-to-end behavior of that pipeline.
 */

describe("looksLikeQuestionOrComment", () => {
  describe("real answer attempts (should NOT be tagged)", () => {
    const ANSWERS = [
      "B",
      "the second one",
      "x equals 5",
      "add 4 to both sides",
      "negative twenty",
      "12",
      "option C",
    ];
    for (const text of ANSWERS) {
      it(`keeps ${JSON.stringify(text)}`, () => {
        expect(looksLikeQuestionOrComment(text)).toBe(false);
      });
    }
  });

  describe("questions and comments (should be tagged)", () => {
    const QUESTIONS = [
      "what is x",
      "why does that work",
      "show me the graph",
      "I don't understand",
      "I'm confused about this",
      "can you explain that",
      "what does that mean?",
      "How do I solve this",
      "tell me more",
      // Anything > 6 words is treated as a comment/explanation.
      "I think the answer is x equals five but I'm not sure",
    ];
    for (const text of QUESTIONS) {
      it(`tags ${JSON.stringify(text)}`, () => {
        expect(looksLikeQuestionOrComment(text)).toBe(true);
      });
    }
  });

  describe("integration with cleanTranscript", () => {
    // The pipeline: raw STT → cleanTranscript → looksLikeQuestionOrComment.
    // Without the strip, the parenthetical word count tips the
    // utterance into question-shaped territory and the matcher is
    // bypassed.
    it("STT-ambient-marker class no longer trips the word-count gate", () => {
      const raw = "Add four to both sides (instrumental music plays).";
      const cleaned = cleanTranscript(raw);
      // Real content: 5 + period token = 6 — at-or-below the threshold.
      expect(looksLikeQuestionOrComment(cleaned)).toBe(false);
    });
  });
});

describe("matchByRegex — multi-word option matching", () => {
  // These options mimic actual multiple-choice steps from SAT lessons.
  const OPTIONS = [
    "add 4 to both sides",
    "subtract 4 from both sides",
    "multiply both sides by 4",
    "divide both sides by 4",
  ];

  describe("the (instrumental music plays) regression", () => {
    it("matches 'Add four to both sides .' after cleanTranscript strip", () => {
      // The trailing " ." comes from cleanTranscript's marker-replacement
      // step (paren → space, period stays). The matcher's own trailing-
      // punctuation strip handles it.
      const cleaned = cleanTranscript("Add four to both sides (instrumental music plays).");
      expect(matchByRegex(cleaned, OPTIONS)).toBe(0);
    });

    it("matches even with TTS-style 'four' as a number word", () => {
      // The matcher's normalize() rewrites "four" → "4" before comparing
      // against the option "add 4 to both sides".
      expect(matchByRegex("Add four to both sides", OPTIONS)).toBe(0);
    });

    it("matches the other options too (sanity check)", () => {
      expect(matchByRegex("subtract four from both sides", OPTIONS)).toBe(1);
      expect(matchByRegex("multiply both sides by four", OPTIONS)).toBe(2);
      expect(matchByRegex("divide both sides by four", OPTIONS)).toBe(3);
    });
  });

  describe("shorthand answers", () => {
    it("matches single letter", () => {
      expect(matchByRegex("A", OPTIONS)).toBe(0);
      expect(matchByRegex("option B", OPTIONS)).toBe(1);
      expect(matchByRegex("the C", OPTIONS)).toBe(2);
    });

    it("matches ordinals", () => {
      expect(matchByRegex("first", OPTIONS)).toBe(0);
      expect(matchByRegex("the second one", OPTIONS)).toBe(1);
      expect(matchByRegex("third option", OPTIONS)).toBe(2);
    });

    it("matches number words for the choice index", () => {
      expect(matchByRegex("option one", OPTIONS)).toBe(0);
      expect(matchByRegex("number two", OPTIONS)).toBe(1);
    });
  });

  describe("literal-number options (slope check-in regression)", () => {
    // The "What is the slope of y = 3x + 5?" check-in. Saying "3" must
    // select the literal "3" (index 0), NOT the 3rd option "-3" (index 2).
    const NUM_OPTIONS = ["3", "5", "-3", "x"];

    it("matches a bare digit to its literal option, not its position", () => {
      expect(matchByRegex("3", NUM_OPTIONS)).toBe(0);
      expect(matchByRegex("5", NUM_OPTIONS)).toBe(1);
    });

    it("matches a bare spelled-out number to its literal option", () => {
      expect(matchByRegex("three", NUM_OPTIONS)).toBe(0);
      expect(matchByRegex("five", NUM_OPTIONS)).toBe(1);
    });

    it("still resolves explicit positional phrasing", () => {
      // "option 3" / "number two" are unambiguously positional.
      expect(matchByRegex("option 3", NUM_OPTIONS)).toBe(2);
      expect(matchByRegex("number two", NUM_OPTIONS)).toBe(1);
    });

    it("falls back to positional digits when no option matches literally", () => {
      const WORDS = ["apple", "banana", "cherry"];
      expect(matchByRegex("3", WORDS)).toBe(2);
    });
  });

  describe("misses cleanly (returns null → chat dispatch)", () => {
    it("returns null on unrelated utterance", () => {
      expect(matchByRegex("hello world", OPTIONS)).toBe(null);
      expect(matchByRegex("what is this", OPTIONS)).toBe(null);
    });
  });
});
