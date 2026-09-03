/**
 * Voice → answer-selection matchers for interaction steps (check_in /
 * predict multiple-choice cards).
 *
 * Two layers, tried in order:
 *   1. matchByRegex — cheap synchronous patterns: single letter
 *      ("A", "option B"), ordinals ("first", "second"), numbers
 *      ("option 2"), and direct option-text matches after
 *      normalization.
 *   2. matchByLLM — async fallback to a Haiku-class model that
 *      decides whether the transcript semantically picks one of
 *      the options. Used when regex strikes out but the student
 *      clearly meant an option ("it's x equals five" → option
 *      "x = 5").
 *
 * Both return either an option index or null. Callers gate on
 * confidence by treating null as "fall through to chat dispatch".
 */

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];
const NUMBER_WORDS = ["one", "two", "three", "four", "five", "six"];

const SPELLED_OUT_NUMBERS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  ten: "10", eleven: "11", twelve: "12", thirteen: "13",
  fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17",
  eighteen: "18", nineteen: "19", twenty: "20", thirty: "30",
  forty: "40", fifty: "50", sixty: "60", seventy: "70",
  eighty: "80", ninety: "90", hundred: "100",
};

/**
 * Light normalization specifically for populating a fill_blank input
 * field with a voice transcript. Preserves casing so algebra like
 * "X = 5" stays intact; just converts spelled-out numbers to digits
 * and "equals" to "=". The student then reviews / submits.
 */
export function normalizeFillBlankInput(text: string): string {
  let t = text.trim();
  // word → digit (case-insensitive, but only the spelled word is
  // replaced — surrounding context stays the same casing).
  t = t.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b/gi,
    (m) => SPELLED_OUT_NUMBERS[m.toLowerCase()] ?? m,
  );
  // "equals" / "equal to" / "is equal to" → "="
  t = t.replace(/\b(is\s+equal\s+to|equal\s+to|equals)\b/gi, "=");
  // Strip trailing punctuation common from TTS sentence endings.
  t = t.replace(/[.!?,;]+$/g, "").trim();
  // Tighten whitespace around `=`.
  t = t.replace(/\s*=\s*/g, " = ").replace(/\s+/g, " ").trim();
  return t;
}

function normalize(s: string): string {
  // Lowercase, strip punctuation, collapse whitespace. Preserve
  // `=` since option text often includes it.
  let t = s.toLowerCase().replace(/[^\w\s=+\-*/]/g, " ").replace(/\s+/g, " ").trim();
  // Replace spelled-out numbers with digits so "x equals five" matches
  // option "x = 5". Single-pass word replacement.
  t = t.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b/g, (m) => SPELLED_OUT_NUMBERS[m] ?? m);
  // "equals" / "equal to" / "is equal to" → "="
  t = t.replace(/\b(is\s+equal\s+to|equal\s+to|equals|is)\b/g, "=");
  // Final whitespace collapse + trim
  t = t.replace(/\s*=\s*/g, "=").replace(/\s+/g, " ").trim();
  return t;
}

/**
 * Pre-filter for the voice answer-matcher: returns true when the
 * transcript is shaped like a question or comment rather than an
 * answer attempt. The dispatch skips both the regex and LLM matchers
 * for these and routes straight to chat — preserves the natural
 * "I can't see the equation" / "what does that mean?" path.
 *
 * Two signals, OR'd together:
 *  - Length: anything > 6 words is almost never a multiple-choice
 *    answer. Real answers are short ("B", "the second one",
 *    "x equals five", "negative twenty"). Long utterances are
 *    explanations / questions / commentary.
 *  - Lexical: leading interrogatives ("what", "why", "how", "can
 *    you", "show me", "I don't", "I can't", etc.) are dead
 *    giveaways. Trailing "?" is rarely present in voice
 *    transcripts but caught defensively.
 */
export function looksLikeQuestionOrComment(transcript: string): boolean {
  const t = transcript.trim().toLowerCase();
  if (!t) return true;

  // Word-count gate.
  const wordCount = t.split(/\s+/).length;
  if (wordCount > 6) return true;

  // Trailing "?" → obvious question. STT rarely emits these but
  // worth a defensive check.
  if (/\?$/.test(transcript.trim())) return true;

  // Leading interrogatives + first-person phrasings.
  // Whole-word boundary so "what" matches "what" but not "whatever
  // five is" (which probably IS an answer attempt).
  const QUESTION_HEADS = [
    "what", "why", "how", "when", "where", "who", "which",
    "can you", "could you", "would you", "will you",
    "can i", "could i", "may i",
    "show me", "tell me", "explain", "describe",
    "is it", "is this", "is that", "are these", "are those",
    "do you", "does it", "doesn't this", "doesn't that",
    "i don't", "i dont", "i can't", "i cant",
    "i need", "i want", "i'm not", "im not",
    "im confused", "i'm confused", "im stuck", "i'm stuck",
    "wait", "hmm", "huh",
    "go back", "back up", "repeat", "say that again", "one more time",
    "slow down", "slower",
  ];
  for (const head of QUESTION_HEADS) {
    if (t === head || t.startsWith(head + " ") || t.startsWith(head + ",") || t.startsWith(head + "?")) {
      return true;
    }
  }

  return false;
}

export function matchByRegex(transcript: string, options: string[]): number | null {
  const raw = transcript.trim().toLowerCase().replace(/[.!?,]+$/g, "");
  if (!raw) return null;

  // 1. Single letter — "a", "b", "option a", "letter b", "the c"
  const letterMatch = raw.match(/^(?:(?:option|letter|the|choice|answer)\s+)?([a-f])\b\.?$/);
  if (letterMatch) {
    const idx = letterMatch[1].charCodeAt(0) - 97;
    if (idx >= 0 && idx < options.length) return idx;
  }

  // 2. Ordinal — "first", "the second one", etc.
  for (let i = 0; i < ORDINALS.length; i++) {
    const ord = ORDINALS[i];
    if (
      raw === ord ||
      raw === `the ${ord}` ||
      raw === `the ${ord} one` ||
      raw === `${ord} one` ||
      raw === `${ord} option` ||
      raw === `${ord} answer`
    ) {
      if (i < options.length) return i;
    }
  }

  // 3. Direct literal option-text match (normalized exact equality).
  //    Checked BEFORE positional number/digit matching: a bare "3"
  //    spoken against options ["3", "5", "-3", "x"] must select the
  //    literal "3", not the 3rd option (-3). normalize() folds
  //    spelled-out numbers to digits, so "three" lands here too.
  const normTransExact = normalize(raw);
  for (let i = 0; i < options.length; i++) {
    if (normalize(options[i]) === normTransExact) return i;
  }

  // 4. Number word — "one", "option two", "number three". Bare
  //    spelled numbers ("three") that equal an option are caught by
  //    step 3 above; this is the prefixed positional form.
  for (let i = 0; i < NUMBER_WORDS.length; i++) {
    const n = NUMBER_WORDS[i];
    if (
      raw === n ||
      raw === `option ${n}` ||
      raw === `number ${n}` ||
      raw === `choice ${n}` ||
      raw === `answer ${n}`
    ) {
      if (i < options.length) return i;
    }
  }

  // 5. Digit — "1", "option 2", "the 3". A bare digit that exactly
  //    equals an option's literal text was already resolved in step 3;
  //    what remains here is positional ("the 3rd option").
  const digitMatch = raw.match(/^(?:(?:option|number|the|choice|answer)\s+)?(\d+)$/);
  if (digitMatch) {
    const idx = parseInt(digitMatch[1], 10) - 1;
    if (idx >= 0 && idx < options.length) return idx;
  }

  // 6. Option text appears as a clear substring — "it's x equals 5"
  //    contains "x=5" after normalization. Conservative: require the
  //    option to be a meaningful chunk (>= 2 chars after norm) and to
  //    be the longest such match.
  let bestIdx: number | null = null;
  let bestLen = 0;
  for (let i = 0; i < options.length; i++) {
    const opt = normalize(options[i]);
    if (opt.length >= 2 && normTransExact.includes(opt) && opt.length > bestLen) {
      bestIdx = i;
      bestLen = opt.length;
    }
  }
  return bestIdx;
}

/**
 * Asks the agents `/answer-match` endpoint to judge which option (if
 * any) the transcript is selecting. Used when regex didn't match.
 * Returns null on any failure or "no match" reply.
 */
export async function matchByLLM(
  transcript: string,
  options: string[],
  question: string,
  signal?: AbortSignal,
): Promise<number | null> {
  try {
    const res = await fetch("/api/agent/answer-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, options, question }),
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { index?: number };
    if (typeof data.index !== "number") return null;
    if (data.index < 0 || data.index >= options.length) return null;
    return data.index;
  } catch {
    return null;
  }
}
