import { describe, expect, it } from "vitest";
import { cleanTranscript, isAmbientNoiseTranscript } from "@/lib/voice/transcript-filters";

/**
 * Pins the ambient-noise filter. STT models hallucinate annotations
 * on background noise; left unfiltered, these reach the chat agent as
 * a phantom user message, which kicks off a chat round-trip that
 * silently swallows the student's next real utterance via
 * submitChatText's `if (chat.isProcessing) return` guard. The fix is
 * to drop these at the filter layer.
 *
 * See micro-lesson.tsx dispatchVoiceUtterance for the call site.
 */
describe("isAmbientNoiseTranscript", () => {
  describe("real student speech (should NOT be filtered)", () => {
    const KEEP = [
      "B",
      "the second one",
      "x equals five",
      "I don't understand",
      "Can you show me the graph",
      "solve (x + 4) = 7", // math content with parens stays
      "the answer is 12",
      "yes",
      "got it",
      "no",
      "skip",
    ];
    for (const text of KEEP) {
      it(`keeps ${JSON.stringify(text)}`, () => {
        expect(isAmbientNoiseTranscript(text)).toBe(false);
      });
    }
  });

  describe("bracketed / parenthesized ambient markers (should be filtered)", () => {
    const DROP = [
      "(upbeat music)",
      "[Music]",
      "[BLANK_AUDIO]",
      "(coughing)",
      "(throat clearing)",
      "♪ humming ♪",
      "*sigh*",
      "(audience applause)",
      "[BACKGROUND NOISE]",
      "",
      "   ",
      "(coughs) [Music]",
    ];
    for (const text of DROP) {
      it(`drops ${JSON.stringify(text)}`, () => {
        expect(isAmbientNoiseTranscript(text)).toBe(true);
      });
    }
  });

  describe("bare noise-token sentinels (should be filtered)", () => {
    const DROP = [
      "Music",
      "BLANK_AUDIO",
      "Silence",
      "background noise",
      "coughing",
      "humming",
    ];
    for (const text of DROP) {
      it(`drops ${JSON.stringify(text)}`, () => {
        expect(isAmbientNoiseTranscript(text)).toBe(true);
      });
    }
  });

  describe("raw transcribed interjections — phantom-chat regression class", () => {
    // Long-cough / throat-clear regression: ElevenLabs Scribe sometimes
    // transcribes sustained non-speech phonetically rather than tagging
    // it as `(coughing)`. Those transcripts have no bracketed markers
    // and slip past the original filter, reaching the chat agent and
    // triggering a round-trip that locks out subsequent real utterances
    // via the chat.isProcessing guard.
    const DROP = [
      "uh huh uh huh",
      "uh huh huh huh huh",
      "ahem ahem",
      "oh oh oh",
      "hmm hmm hmm",
      "ah ah ah",
      "ugh",
      "ohh ohh",
      "huh huh huh",
      "achoo",
      "uhhuh uhhuh",
      "mhm mhm",
      "Uh huh uh huh", // case-insensitive
      "Oh, oh, oh",      // punctuation stripped
    ];
    for (const text of DROP) {
      it(`drops cough-noise transcript ${JSON.stringify(text)}`, () => {
        expect(isAmbientNoiseTranscript(text)).toBe(true);
      });
    }
  });

  describe("interjection prefix with real content (should NOT be filtered)", () => {
    // The interjection check requires the WHOLE transcript to decompose
    // into junk tokens. "Uh, what does this mean" still has the content
    // word "what" and reaches the chat agent.
    const KEEP = [
      "uh what is x",
      "hmm I'm not sure",
      "ah I see",
      "oh that makes sense",
    ];
    for (const text of KEEP) {
      it(`keeps ${JSON.stringify(text)}`, () => {
        expect(isAmbientNoiseTranscript(text)).toBe(false);
      });
    }
  });
});

describe("cleanTranscript", () => {
  describe("strips embedded ambient markers", () => {
    const CASES: Array<[string, string]> = [
      [
        "Add four to both sides (instrumental music plays).",
        "Add four to both sides .",
      ],
      [
        "Solve for x (background noise) carefully",
        "Solve for x carefully",
      ],
      [
        "I think it's twelve [Music]",
        "I think it's twelve",
      ],
      [
        "What does that mean ♪ humming ♪",
        "What does that mean",
      ],
      [
        "Yeah *coughs* I got it",
        "Yeah I got it",
      ],
      [
        "(applause) The answer is B",
        "The answer is B",
      ],
      [
        // Multiple markers in one transcript.
        "(coughs) hey can you (clears throat) help me with this",
        "hey can you help me with this",
      ],
    ];
    for (const [input, expected] of CASES) {
      it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
        expect(cleanTranscript(input)).toBe(expected);
      });
    }
  });

  describe("preserves math content with parentheses", () => {
    // The critical correctness property: cleanTranscript must NOT
    // strip math parens. Students sometimes voice expressions like
    // "x plus four equals seven" but ElevenLabs sometimes returns
    // them with parens — we keep those intact.
    const CASES: Array<[string, string]> = [
      ["solve (x + 4) = 7", "solve (x + 4) = 7"],
      ["the formula is (a + b)^2", "the formula is (a + b)^2"],
      ["compute (3 + 5) * 2", "compute (3 + 5) * 2"],
      // Parens with digits inside stay
      ["(2x + 1) equals zero", "(2x + 1) equals zero"],
    ];
    for (const [input, expected] of CASES) {
      it(`keeps math parens in ${JSON.stringify(input)}`, () => {
        expect(cleanTranscript(input)).toBe(expected);
      });
    }
  });

  describe("collapses repeated whitespace", () => {
    it("doesn't leave double spaces where markers were", () => {
      expect(cleanTranscript("a (music)  b")).toBe("a b");
      expect(cleanTranscript("hello [BLANK_AUDIO] world")).toBe("hello world");
    });
  });

  describe("edge cases", () => {
    it("returns empty string for empty input", () => {
      expect(cleanTranscript("")).toBe("");
      expect(cleanTranscript("   ")).toBe("");
    });
    it("returns empty string when transcript is only markers", () => {
      expect(cleanTranscript("(coughs)")).toBe("");
      expect(cleanTranscript("[Music]")).toBe("");
      expect(cleanTranscript("(music) [silence] ♪ humming ♪")).toBe("");
    });
  });
});
