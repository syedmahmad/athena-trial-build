/**
 * Adherence evaluator: checks that a lesson follows the prompt's structural
 * rules. Does NOT check math correctness (see ./math.ts).
 *
 * Uses explicit `operationGroupId` + `phase` fields on steps — no proximity-
 * based triplet inference. That's what makes this v1 robust to narration /
 * graphing / other steps appearing between phases.
 */

import {
  EXPANDING_OPS,
  type AdherenceMetrics,
  type MicroLessonOperation,
  type WhiteboardStep,
} from "./types";
import { shapePartBoard, type PointableAction } from "@/components/whiteboard/pen-tip";

const ROLE_REGEX = /\\htmlClass\{(op-target|op-new|op-cancel|op-result)\}/g;

const VALID_OPS = new Set<MicroLessonOperation>([
  "identify", "setup", "state", "substitute", "distribute", "combine",
  "add", "subtract", "multiply", "divide", "factor", "simplify",
  "plot", "highlight", "conclude",
]);

const TEACHING_ACTION_TYPES = new Set([
  "write_math", "write_text", "highlight", "draw_shape",
  "coordinate_plane", "geometry", "number_line", "table",
]);

function isTeachingStep(step: WhiteboardStep): boolean {
  const t = step.action?.type;
  return typeof t === "string" && TEACHING_ACTION_TYPES.has(t);
}

const QUESTION_STARTERS = new Set([
  "what", "which", "how", "why", "when", "where", "who", "is", "are", "do",
  "does", "did", "can", "could", "will", "would", "find", "solve", "compute",
  "calculate", "identify", "determine", "write", "choose", "select",
  "evaluate", "simplify",
]);

function readsAsQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.endsWith("?")) return true;
  const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  return QUESTION_STARTERS.has(firstWord);
}

const NARRATION_STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "of", "to", "for", "in", "on", "at",
  "and", "or", "with", "that", "this", "these", "those", "it", "its", "be",
  "as", "by", "from", "we", "you", "i", "our", "your", "my",
  "equals", "equal", "then", "so",
]);

function contentTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      // Replace punctuation and math delimiters with spaces, keep hyphens
      // inside words (e.g. y-intercept stays one token).
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .map((t) => t.replace(/^-+|-+$/g, ""))
      .filter((t) => t.length > 0 && !NARRATION_STOPWORDS.has(t)),
  );
}

// Phonetic-math words that appear ONLY in narration (TTS pronunciation aids)
// — strip these before comparing prose to displayText so we don't expect
// "squared" / "wye" to show up on the visible panel.
const PHONETIC_MATH_WORDS = new Set([
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve",
  "equals", "equal", "plus", "minus", "times", "divided", "over",
  "negative", "positive", "squared", "cubed", "power",
  "pi", "wye", "ex", "comma", "dot", "into", "by",
  "sub", "of",
]);

function prose(text: string, isNarration: boolean): string {
  if (!text) return "";
  let out = text;
  if (isNarration) {
    // Normalize phonetic letter spellings used for TTS so they match the
    // symbolic forms that appear in displayText. "wye-intercept" → "y-intercept".
    out = out.replace(/\bwye-/gi, "y-").replace(/\bwye\b/gi, "y");
  }
  // Collapse \macro{...}{body} wrappers to body
  for (let i = 0; i < 3; i++) {
    const prev = out;
    out = out.replace(/\\(htmlClass|htmlId|cssId|textcolor|color)\{[^{}]*\}\{([^{}]*)\}/g, "$2");
    if (out === prev) break;
  }
  // \frac{a}{b} / \tfrac → "a b"
  out = out.replace(/\\t?frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1 $2");
  // Drop remaining LaTeX commands (\\pi, \\cdot, etc.)
  out = out.replace(/\\[a-zA-Z]+/g, " ");
  // Strip $ delimiters
  out = out.replace(/\$/g, " ");
  return out;
}

function proseTokens(text: string, isNarration: boolean): Set<string> {
  return new Set(
    [...contentTokens(prose(text, isNarration))].filter(
      (t) => !PHONETIC_MATH_WORDS.has(t) && !/^\d+$/.test(t) && t.length > 1,
    ),
  );
}

/**
 * Check that displayText carries the same prose ideas as narration. The
 * student SEES displayText and HEARS narration — if narration introduces
 * words/concepts displayText omits, the panels desync. Skips interaction
 * steps (handled by checkInteractionNarration) and steps without both
 * fields populated.
 */
function checkDisplayNarrationParity(
  step: WhiteboardStep,
): { severity: "strong" | "weak"; missing: string[]; reason: string } | null {
  const narration = step.narration?.trim();
  const displayText = step.displayText?.trim();
  if (!narration || !displayText) return null;

  // Only enforce parity on teaching steps. Interaction steps use the
  // narration as the answer-explanation, which intentionally diverges.
  if (!isTeachingStep(step)) return null;

  const narrTokens = proseTokens(narration, true);
  // Narration must have enough prose words to be worth comparing — pure
  // math narration ("x equals 3") collapses to nothing here.
  if (narrTokens.size < 4) return null;

  const dispTokens = proseTokens(displayText, false);
  const missing = [...narrTokens].filter((t) => !dispTokens.has(t));
  const missingRate = missing.length / narrTokens.size;

  // Note: previously a "strong" mismatch fired when displayText was
  // pure math (no prose tokens) and narration had ≥4 prose words.
  // That over-fired on legitimate authoring choices where the visual
  // is bare math (an equation row) and the spoken narration adds
  // brief context — a real and intentional pattern. Removed; only
  // the proportional missing-rate weak check remains.
  if (missingRate > 0.6 && missing.length >= 3) {
    return {
      severity: "weak",
      missing,
      reason: `displayText is missing ${missing.length}/${narrTokens.size} prose word(s) from narration (${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""})`,
    };
  }
  return null;
}

/**
 * Detect when an interaction step's narration looks like the answer or
 * explanation rather than the question — the authoring bug that leaks
 * the answer to TTS when the narration fallback fires.
 */
function checkInteractionNarration(
  step: WhiteboardStep,
): { severity: "strong" | "weak"; reason: string } | null {
  const t = step.action?.type;
  if (t !== "check_in" && t !== "predict" && t !== "fill_blank" && t !== "pulse_check") return null;
  const narration = step.narration?.trim();
  if (!narration) return null;

  const action = step.action as Record<string, unknown>;
  const question = String(action.question ?? action.prompt ?? "").trim();
  const explanation = String(action.explanation ?? "").trim();
  const correctAnswer = (() => {
    if (typeof action.correctOption === "number" && Array.isArray(action.options)) {
      return String(action.options[action.correctOption] ?? "").trim();
    }
    if (Array.isArray(action.acceptedAnswers)) {
      return String(action.acceptedAnswers[0] ?? "").trim();
    }
    return "";
  })();

  const isQuestionShaped = readsAsQuestion(narration);

  // Strong signal #1: narration literally contains the correct answer's
  // option label (length >= 3 so shared digits aren't false positives).
  if (correctAnswer && correctAnswer.length >= 3) {
    if (narration.toLowerCase().includes(correctAnswer.toLowerCase())) {
      return {
        severity: "strong",
        reason: `narration contains the correct answer text ("${correctAnswer}")`,
      };
    }
  }

  // Strong signal #2: narration contains an explanation marker ("because",
  // "therefore", etc.) AND isn't phrased as a question.
  if (!isQuestionShaped && /\b(because|therefore|thus|hence|since)\b/i.test(narration)) {
    return {
      severity: "strong",
      reason: "narration uses explanation words (because / therefore / ...) instead of asking the question",
    };
  }

  // Strong signal #2.5: narration walks through worked-solution steps
  // before the question — patterns like "after distributing, you get …",
  // "first subtract …, then divide", "this gives 2x = 6". These leak the
  // method even when the line ends with `?` because they hand the
  // student the chain of operations to apply. The question should ask
  // *what* to do, not narrate *how* to do it. Fires regardless of
  // question-shape since the worked-solution prose is the issue.
  const SOLUTION_PROSE_RE =
    /\b(after\s+\w+ing|you\s+get|we\s+get|this\s+gives|this\s+yields|first\s+\w+(?:,?\s+then\s+\w+)|then\s+\w+,)\b/i;
  if (SOLUTION_PROSE_RE.test(narration)) {
    return {
      severity: "strong",
      reason: "narration walks through worked-solution steps before the question (e.g. 'after distributing, you get …')",
    };
  }

  // Strong signal #3: narration shares ≥3 content tokens with the
  // explanation field AND isn't phrased as a question. Distinct content
  // overlap is a strong cue the author dropped the explanation in here.
  //
  // SKIP this check when displayText is empty. Interaction steps often
  // have no displayText — the spoken narration carries the entire
  // question setup, so it naturally shares vocabulary with the
  // explanation (subject terms, the equation in question, the variable
  // name). Without a parallel displayText to mirror, content overlap
  // here is not a reliable leak signal. Strong signals #1 (literal
  // answer text) and #2 (explanation markers like "because") still
  // fire and catch the actual leaks in this case.
  const displayText = (step.displayText ?? "").trim();
  if (!isQuestionShaped && explanation && displayText) {
    const narT = contentTokens(narration);
    const expT = contentTokens(explanation);
    const shared: string[] = [];
    for (const t of narT) if (expT.has(t)) shared.push(t);
    if (shared.length >= 3) {
      return {
        severity: "strong",
        reason: `narration shares ${shared.length} content tokens with explanation (${shared.slice(0, 4).join(", ")}${shared.length > 4 ? ", …" : ""})`,
      };
    }
  }

  // Weak: the step's question reads as a question but the narration doesn't.
  // Catches ambiguous cases that aren't clearly explanations but also aren't
  // clearly questions.
  if (question && readsAsQuestion(question) && !isQuestionShaped) {
    return {
      severity: "weak",
      reason: "narration does not read as a question (no question word, no ?)",
    };
  }

  return null;
}

/** Count distinct destination spans (`dst-...` htmlClass tags) in the
 *  given LaTeX. Each unique tag corresponds to one substituted variable.
 *  Falls back to counting `op-new` occurrences when no dst- tags are
 *  present (some authoring uses op-new alone). */
function countSubstitutionTargets(latex: string): number {
  const dstMatches = new Set<string>();
  const dstRe = /\\htmlClass\{[^}]*\bdst-([^\s}]+)/g;
  let m: RegExpExecArray | null;
  while ((m = dstRe.exec(latex))) dstMatches.add(m[1]);
  if (dstMatches.size > 0) return dstMatches.size;
  const opNewRe = /\\htmlClass\{[^}]*\bop-new\b/g;
  let count = 0;
  while (opNewRe.exec(latex)) count++;
  return count;
}

/** Read the `\textcolor{#hex}{...}` color (if any) immediately wrapping
 *  a `\htmlClass{<spanId>}{...}` tag. Used to check that a paired
 *  var/val pair was authored with matching hues so the val visually
 *  inherits its variable's color when the chain plays. Returns the
 *  lower-cased hex (with leading #) or null when no \textcolor wraps. */
function readWrappingTextColor(latex: string, spanId: string): string | null {
  // Match `\textcolor{#hex}{` immediately preceding `\htmlClass{...spanId...}`.
  // Tolerant to whitespace and to extra classes inside the htmlClass body.
  const re = new RegExp(
    `\\\\textcolor\\{(#[0-9a-fA-F]+)\\}\\{\\s*\\\\htmlClass\\{[^}]*\\b${spanId}\\b[^}]*\\}`,
  );
  const m = re.exec(latex);
  return m ? m[1].toLowerCase() : null;
}

/** Apply-phase substitute steps must match the count-based visual
 *  pattern: 1 → incomingArrow OR flyInSubstitution, 2+ →
 *  flyInSubstitution (REQUIRED) with matching var/val colors. The
 *  legacy substitutionAnimation field is still accepted for backwards
 *  compat. Flags oversize-without-animation and color-mismatch as
 *  strong (fail accept), single-without-arrow as weak. */
/** Find paired `$...$` math spans using a STRICT pattern: content
 *  doesn't start or end with whitespace, contains no `$` or newline,
 *  and is ≤ 300 chars. Single-character math (`$2$`, `$x$`) is allowed.
 *  This rejects currency runaway like `$30 per month plus $` (content
 *  ends with whitespace) and lets the caller correctly detect
 *  bare-currency / out-of-span LaTeX outside the matched spans.
 *
 *  Cap was 100 originally, but real lessons emit color-coded
 *  expressions like `$\textcolor{#c084fc}{4}(\textcolor{#c084fc}{2}\textcolor{#60a5fa}{x} - \textcolor{#f87171}{1}) + ... = \textcolor{#4ade80}{24}$`
 *  that exceed 100 chars; without a higher cap, long math gets
 *  treated as "not a math span" and the `\textcolor` checks then
 *  fire as false positives. 300 chars covers all observed lesson
 *  math while still bounding the regex's backtracking work and
 *  rejecting genuine currency runaway. */
function findContractMathRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /(?<!\\)\$([^\s$](?:[^$\n]{0,299}[^\s$])?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

/** Enforce the displayText / narration output contract documented in
 *  the agent prompts. Each context (markdown+KaTeX vs TTS) has its
 *  own rules; producers must emit content that's already correct.
 *  We don't transform on read — we just flag here so authoring bugs
 *  surface in the eval rather than as silent breakage in the UI. */
function checkOutputContract(
  step: WhiteboardStep,
): { reasons: string[] } | null {
  const reasons: string[] = [];
  const display = (step.displayText ?? "").trim();
  const narration = (step.narration ?? "").trim();

  if (display) {
    // Rule: `$` delimiters must be balanced. Count unescaped `$`.
    let dollars = 0;
    for (let i = 0; i < display.length; i++) {
      if (display[i] === "$" && display[i - 1] !== "\\") dollars++;
    }
    if (dollars % 2 !== 0) {
      reasons.push("displayText has unbalanced `$` delimiters");
    }

    // Build the OUTSIDE-math substring once and check both rules
    // against it: bare currency `$<digit>` and bare LaTeX commands.
    const ranges = findContractMathRanges(display);
    let outside = "";
    let cursor = 0;
    for (const [s, e] of ranges) {
      outside += display.slice(cursor, s);
      cursor = e;
    }
    outside += display.slice(cursor);

    // Bare currency: any unescaped `$<digit>` that lives OUTSIDE a
    // matched `$...$` math span. Running this on `outside` (with math
    // spans excised) avoids false-positives on legitimate math that
    // begins with a digit, e.g. `$3x + 2y = 12$`.
    if (/(?<!\\)\$\d/.test(outside)) {
      reasons.push("displayText has bare `$<digit>` outside math (use `\\$X` for currency)");
    }
    if (/\\textcolor\b/.test(outside)) {
      reasons.push("displayText uses `\\textcolor` outside `$...$` (only valid inside math)");
    }
    // Other LaTeX commands outside math are also broken; this catches
    // the most common ones the chat agent has emitted.
    if (/\\(frac|sqrt|cdot|times|div|pi|sum|int)\b/.test(outside)) {
      reasons.push("displayText has bare LaTeX command outside `$...$`");
    }
  }

  if (narration) {
    // Narration goes to TTS; no LaTeX, no `$`, no braces.
    if (/\$/.test(narration)) {
      reasons.push("narration contains `$` (use word 'dollars' for currency)");
    }
    if (/\\/.test(narration)) {
      reasons.push("narration contains `\\` (no LaTeX in TTS)");
    }
    if (/[{}]/.test(narration)) {
      reasons.push("narration contains `{` or `}`");
    }
  }

  return reasons.length ? { reasons } : null;
}

/**
 * Detect write_text steps that read as word problems but were emitted
 * as raw prose instead of the structured `word_problem` action. This
 * is the backstop for the structural-prevention work: if the model
 * regresses and starts emitting scenario prose as plain text, the
 * eval flags it before it ships.
 *
 * A step trips the check when it has BOTH:
 *   - prose-length text (>25 words), AND
 *   - at least 2 distinct word-problem signals (currency / quantity
 *     question / quantitative noun / named subject)
 *
 * Heuristic is intentionally narrow — false positives here are
 * expensive (block real lessons), false negatives are okay (the eval
 * is one of three layers, with the type system + prompt being the
 * other two).
 */
const QUANTITY_NOUNS = new Set([
  "ticket", "tickets", "cup", "cups", "mile", "miles", "minute", "minutes",
  "hour", "hours", "item", "items", "book", "books", "student", "students",
  "drink", "drinks", "apple", "apples", "pencil", "pencils", "dollar",
  "dollars", "pound", "pounds", "kilogram", "kilograms", "meter", "meters",
  "year", "years", "day", "days", "week", "weeks", "month", "months",
  "person", "people", "customer", "customers", "page", "pages",
]);
const QUANTITY_QUESTION_PATTERNS = [
  /\bhow\s+many\b/i,
  /\bhow\s+much\b/i,
  /\bfind\s+the\b/i,
  /\bwhat\s+is\s+the\s+(total|number|amount|price|cost|value)\b/i,
];
/**
 * Flag dangling orb pointers: a step's `orbFocus.part` that doesn't resolve
 * against the diagram it points at, so the roaming orb would have nothing to
 * walk to. The referenced diagram is the explicit `refStepId` step or (the
 * runtime default) the most recent prior pointable diagram (geometry,
 * coordinate plane, or number line).
 */
const POINTABLE_TYPES = new Set(["geometry", "coordinate_plane", "number_line"]);
// Resolution is box-independent (only the matched part's coords scale with the
// box), so any non-degenerate box answers "does this part resolve?".
const EVAL_BOX = { x: 0, y: 0, width: 400, height: 300 };

function detectDanglingOrbFocus(steps: WhiteboardStep[]): AdherenceMetrics["danglingOrbFocus"] {
  const out: AdherenceMetrics["danglingOrbFocus"] = [];
  for (let i = 0; i < steps.length; i++) {
    const focus = (steps[i] as { orbFocus?: { refStepId?: number; part?: string } }).orbFocus;
    const part = focus?.part?.trim();
    if (!focus || !part) continue;
    let geom: WhiteboardStep | undefined;
    if (focus.refStepId != null) {
      geom = steps.find((s) => s.id === focus.refStepId);
    } else {
      for (let j = i; j >= 0; j--) {
        const t = (steps[j].action as { type?: string } | undefined)?.type;
        if (t && POINTABLE_TYPES.has(t)) {
          geom = steps[j];
          break;
        }
      }
    }
    const action = geom?.action as { type?: string } | undefined;
    if (!geom || !action?.type || !POINTABLE_TYPES.has(action.type)) {
      out.push({
        stepId: steps[i].id,
        part,
        reason: "no visible diagram (geometry / plane / number line) to point at",
      });
      continue;
    }
    if (!shapePartBoard(action as unknown as PointableAction, part, EVAL_BOX)) {
      out.push({
        stepId: steps[i].id,
        part,
        reason: `part "${part}" does not resolve to a point on the referenced diagram`,
      });
    }
  }
  return out;
}

function detectUnstructuredWordProblems(steps: WhiteboardStep[]): Array<{
  stepId: number;
  excerpt: string;
  reasons: string[];
}> {
  const out: Array<{ stepId: number; excerpt: string; reasons: string[] }> = [];
  for (const step of steps) {
    const action = step.action as Record<string, unknown> | undefined;
    if (!action || action.type !== "write_text") continue;
    const text = typeof action.text === "string" ? action.text : "";
    if (!text) continue;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 25) continue; // prose-length gate

    const reasons: string[] = [];

    // Signal 1: currency. \$N (escaped) or "dollar(s)".
    if (/\\\$\d/.test(text) || /\bdollars?\b/i.test(text)) {
      reasons.push("contains currency");
    }
    // Signal 2: quantitative question phrasing.
    if (QUANTITY_QUESTION_PATTERNS.some((re) => re.test(text))) {
      reasons.push("asks a quantitative question");
    }
    // Signal 3: quantitative noun in singular or plural.
    const lowerWords = text.toLowerCase().match(/[a-z]+/g) ?? [];
    if (lowerWords.some((w) => QUANTITY_NOUNS.has(w))) {
      reasons.push("mentions a quantitative noun");
    }
    // Signal 4: named subject — a capitalized non-stopword that isn't
    // at sentence start. Captures "Sarah is...", "...Bob sold...".
    const namedSubject = /(?<=[a-z]\s|,\s)([A-Z][a-z]{2,})\b/.exec(text);
    if (namedSubject) {
      reasons.push(`named subject ("${namedSubject[1]}")`);
    }

    if (reasons.length >= 2) {
      out.push({
        stepId: step.id,
        excerpt: text.slice(0, 120) + (text.length > 120 ? "…" : ""),
        reasons,
      });
    }
  }
  return out;
}

/** Validate that an action's inner shape matches what the renderer
 *  expects. The model authors action_json under StepUnit's escape hatch
 *  and occasionally guesses at field names — `coordinate_plane` points
 *  with `{x, y}` instead of `at`, lines with `start/end` instead of
 *  `from/to`, interactions missing `question` or with `correctOption`
 *  out of range. The renderer crashes on these; we flag them at eval
 *  time so the model can correct in a self-critique pass. Returns a
 *  list of human-readable problem strings, or null if the shape is OK.
 */
function checkActionShape(step: WhiteboardStep): string[] | null {
  const action = step.action as Record<string, unknown> | undefined;
  if (!action) return ["step has no action"];
  const t = action.type as string | undefined;
  if (!t) return ["action has no type"];
  const reasons: string[] = [];

  const hasPair = (v: unknown): boolean =>
    Array.isArray(v) && v.length >= 2 && typeof v[0] === "number" && typeof v[1] === "number";

  if (t === "write_math") {
    if (typeof action.latex !== "string" || !action.latex) reasons.push("write_math missing `latex`");
  } else if (t === "write_text") {
    if (typeof action.text !== "string" || !action.text) reasons.push("write_text missing `text`");
  } else if (t === "word_problem") {
    if (typeof action.prose !== "string" || !action.prose.trim()) {
      reasons.push("word_problem missing `prose`");
    }
    if (typeof action.equation !== "string" || !action.equation.trim()) {
      reasons.push("word_problem missing `equation`");
    }
    const variables = action.variables;
    if (!Array.isArray(variables) || variables.length === 0) {
      reasons.push("word_problem needs `variables: [{symbol, meaning}]` (>=1)");
    } else {
      variables.forEach((v: unknown, idx: number) => {
        const vv = v as Record<string, unknown>;
        if (typeof vv?.symbol !== "string" || !vv.symbol.trim()) {
          reasons.push(`word_problem.variables[${idx}] missing \`symbol\``);
        }
        if (typeof vv?.meaning !== "string" || !vv.meaning.trim()) {
          reasons.push(`word_problem.variables[${idx}] missing \`meaning\``);
        }
      });
    }
  } else if (t === "coordinate_plane") {
    const elements = action.elements;
    if (!Array.isArray(elements)) {
      reasons.push("coordinate_plane missing `elements: []`");
    } else {
      elements.forEach((e: unknown, idx: number) => {
        const elem = e as Record<string, unknown>;
        const et = elem?.type as string | undefined;
        if (!et) {
          reasons.push(`element[${idx}] missing \`type\``);
          return;
        }
        // For points and lines, REQUIRE the canonical field name even
        // when an alternate (`coords`, `{x,y}`, `start`/`end`) would be
        // readable. The renderer is permissive, but the model should
        // converge on one shape — this flag tells it which.
        if (et === "point" && !hasPair(elem.at)) {
          if (
            hasPair(elem.coords) || hasPair(elem.point) || hasPair(elem.position) ||
            (typeof elem.x === "number" && typeof elem.y === "number")
          ) {
            reasons.push(`point element[${idx}] uses non-canonical coordinate field; use \`at: [x, y]\``);
          } else {
            reasons.push(`point element[${idx}] missing coordinate \`at: [x, y]\``);
          }
        }
        if (et === "line") {
          const hasFrom = hasPair(elem.from);
          const hasTo = hasPair(elem.to);
          if (!hasFrom || !hasTo) {
            const altFrom = hasPair(elem.start) || hasPair(elem.a);
            const altTo = hasPair(elem.end) || hasPair(elem.b);
            if (altFrom || altTo) {
              reasons.push(`line element[${idx}] uses non-canonical endpoint field; use \`from: [x, y]\` and \`to: [x, y]\``);
            } else {
              reasons.push(`line element[${idx}] missing endpoints \`from\` and \`to\``);
            }
          }
        }
        if (et === "function" && !Array.isArray(elem.points)) {
          reasons.push(`function element[${idx}] missing \`points: [[x, y], ...]\``);
        }
        if (et === "vertical_line" && typeof elem.x !== "number") {
          reasons.push(`vertical_line element[${idx}] missing \`x: number\``);
        }
        if (et === "horizontal_line" && typeof elem.y !== "number") {
          reasons.push(`horizontal_line element[${idx}] missing \`y: number\``);
        }
      });
    }
  } else if (t === "number_line") {
    // Canonical shape (matches `NumberLineAction` in `src/types/whiteboard.ts`):
    //   range: [min, max]
    //   points?: [{ value, label?, style?: { color?, filled?, radius? } }]
    // Generated lessons sometimes ship `min`/`max` scalars and `markers`
    // with flat `color` instead — the renderer tolerates both, but the
    // eval flags the non-canonical shape so the critic / future prompt
    // tweaks can nudge authors back to the canonical form.
    const range = (action as { range?: unknown }).range;
    const hasRange =
      Array.isArray(range) && range.length === 2 &&
      typeof range[0] === "number" && typeof range[1] === "number";
    if (!hasRange) {
      const hasMinMax =
        typeof (action as { min?: unknown }).min === "number" &&
        typeof (action as { max?: unknown }).max === "number";
      if (hasMinMax) {
        reasons.push("number_line uses non-canonical `min`/`max` scalars; expected `range: [min, max]`");
      } else {
        reasons.push("number_line missing `range: [min, max]`");
      }
    }
    if ((action as { markers?: unknown }).markers !== undefined) {
      reasons.push("number_line uses non-canonical `markers`; expected `points: [{ value, label?, style?: { color? } }]`");
    }
  } else if (t === "table") {
    if (!Array.isArray(action.headers)) reasons.push("table missing `headers: string[]`");
    if (!Array.isArray(action.rows)) reasons.push("table missing `rows: string[][]`");
  } else if (t === "highlight") {
    const hasTarget =
      typeof action.targetStepId === "number" ||
      typeof action.targetStepIndex === "number" ||
      (Array.isArray(action.targetStepIndices) && action.targetStepIndices.length > 0) ||
      !!action.region;
    if (!hasTarget) reasons.push("highlight missing target (`targetStepId`, `targetStepIndex`, or `region`)");
  } else if (t === "predict" || t === "check_in") {
    if (typeof action.question !== "string" || !action.question) {
      reasons.push(`${t} missing \`question\``);
    } else if (
      /\b(after\s+\w+ing|you\s+get|we\s+get|this\s+gives|this\s+yields|first\s+\w+(?:,?\s+then\s+\w+)|then\s+\w+,)\b/i.test(
        action.question,
      )
    ) {
      reasons.push(
        `${t} \`question\` walks through worked-solution steps (e.g. "after distributing, you get …") — move that prose to \`explanation\``,
      );
    }
    const opts = action.options;
    if (!Array.isArray(opts) || opts.length < 2) {
      reasons.push(`${t} needs \`options: string[]\` (>=2)`);
    } else if (typeof action.correctOption !== "number" || action.correctOption < 0 || action.correctOption >= opts.length) {
      reasons.push(`${t} \`correctOption\` (${action.correctOption}) out of range [0, ${opts.length})`);
    }
    if (typeof action.explanation !== "string" || !action.explanation) {
      reasons.push(`${t} missing \`explanation\``);
    }
  } else if (t === "fill_blank") {
    const fbQuestion =
      typeof action.question === "string"
        ? action.question
        : typeof action.prompt === "string"
          ? action.prompt
          : null;
    if (fbQuestion === null) {
      reasons.push("fill_blank missing `question` or `prompt`");
    } else if (
      /\b(after\s+\w+ing|you\s+get|we\s+get|this\s+gives|this\s+yields|first\s+\w+(?:,?\s+then\s+\w+)|then\s+\w+,)\b/i.test(
        fbQuestion,
      )
    ) {
      reasons.push(
        "fill_blank `question` walks through worked-solution steps (e.g. \"after distributing, you get …\") — move that prose to `explanation`",
      );
    }
    if (!Array.isArray(action.acceptedAnswers) || action.acceptedAnswers.length === 0) {
      reasons.push("fill_blank missing `acceptedAnswers: string[]` (non-empty)");
    }
  } else if (t === "pulse_check") {
    // pulse_check is the mid-TEACH soft probe of a misconception. Strict
    // structure (exactly 2 options, both explanations present), plus
    // tone lints (no generic "did you get it?" framing — that defeats
    // the whole point of pulse_check vs. check_in).
    if (typeof action.question !== "string" || !action.question) {
      reasons.push("pulse_check missing `question`");
    }
    const opts = action.options;
    if (!Array.isArray(opts) || opts.length !== 2) {
      reasons.push(`pulse_check needs EXACTLY 2 \`options\` (got ${Array.isArray(opts) ? opts.length : "none"})`);
    } else if (
      typeof action.correctOption !== "number" ||
      action.correctOption < 0 ||
      action.correctOption >= opts.length
    ) {
      reasons.push(`pulse_check \`correctOption\` (${action.correctOption}) out of range [0, 2)`);
    }
    if (typeof action.explanation !== "string" || !action.explanation) {
      reasons.push("pulse_check missing `explanation` (shown when student picks the correct option)");
    }
    if (typeof action.trapExplanation !== "string" || !action.trapExplanation) {
      reasons.push(
        "pulse_check missing `trapExplanation` (shown when student picks the misconception — must validate the instinct, then redirect)",
      );
    }
    // Generic "did you understand?" stems defeat pulse_check's purpose
    // (probing a SPECIFIC pitfall). The prompt explicitly forbids these;
    // catch any that slip through.
    const q = typeof action.question === "string" ? action.question.toLowerCase() : "";
    const GENERIC_STEM_RE =
      /\b(did you (understand|get|catch|follow)|do you (get|understand)|does that make sense|are you with me|got it\??|make sense\??)\b/i;
    if (q && GENERIC_STEM_RE.test(q)) {
      reasons.push(
        "pulse_check `question` uses a generic understanding-check stem (e.g. \"did you understand?\", \"got it?\") — pulse_check must probe a SPECIFIC misconception, not ask for self-reported comprehension",
      );
    }
  }

  return reasons.length ? reasons : null;
}

function checkSubstitutionPattern(
  step: WhiteboardStep,
): { severity: "strong" | "weak"; count: number; reason: string } | null {
  if (step.operation !== "substitute") return null;
  if (step.action?.type !== "write_math") return null;
  // Apply phase OR compact single-step substitution. Collapse / state
  // members of a triplet don't introduce values themselves.
  if (step.phase && step.phase !== "apply") return null;
  const latex = (step.action as { latex?: string }).latex ?? "";
  const count = countSubstitutionTargets(latex);
  // 2+ substitutions: REQUIRE flyInSubstitution (or legacy
  // substitutionAnimation). Without one, the values pop in unanimated
  // and read as a wall of new content.
  if (count >= 2 && !step.flyInSubstitution && !step.substitutionAnimation) {
    return {
      severity: "strong",
      count,
      reason: `${count} substitutions in one step without flyInSubstitution — values must arc into the equation from their source step`,
    };
  }
  // Color parity check: each pair (var/val) should be wrapped in
  // matching \textcolor on both sides so the value inherits the
  // variable's hue when it lands.
  if (step.flyInSubstitution) {
    const fromLatex = step.flyInSubstitution.fromLatex ?? "";
    const mismatches: string[] = [];
    for (const pair of step.flyInSubstitution.pairs) {
      const fromColor = readWrappingTextColor(fromLatex, pair.fromSpan);
      const toColor = readWrappingTextColor(latex, pair.toSpan);
      if (fromColor !== toColor) {
        mismatches.push(
          `${pair.fromSpan} (${fromColor ?? "uncolored"}) ↔ ${pair.toSpan} (${toColor ?? "uncolored"})`,
        );
      }
    }
    if (mismatches.length) {
      return {
        severity: "strong",
        count,
        reason: `flyInSubstitution pairs have mismatched colors — ${mismatches.join("; ")}`,
      };
    }
  }
  if (step.substitutionAnimation) {
    const fromLatex = step.substitutionAnimation.fromLatex ?? "";
    const mismatches: string[] = [];
    for (const pair of step.substitutionAnimation.sequence) {
      const fromColor = readWrappingTextColor(fromLatex, pair.fromSpan);
      const toColor = readWrappingTextColor(latex, pair.toSpan);
      if (fromColor !== toColor) {
        mismatches.push(
          `${pair.fromSpan} (${fromColor ?? "uncolored"}) ↔ ${pair.toSpan} (${toColor ?? "uncolored"})`,
        );
      }
    }
    if (mismatches.length) {
      return {
        severity: "strong",
        count,
        reason: `substitutionAnimation pairs have mismatched colors — ${mismatches.join("; ")}`,
      };
    }
  }
  if (count === 1 && !step.incomingArrow && !step.flyInSubstitution) {
    return {
      severity: "weak",
      count,
      reason: "single substitution should set incomingArrow or flyInSubstitution for src→dst continuity",
    };
  }
  return null;
}

/** Strip role / color / class wrappers and whitespace so two LaTeX strings
 *  that differ only in highlight tagging compare as identical. Used by the
 *  near-duplicate check: an APPLY step (with op-target highlights) and the
 *  following STATE step (untagged) typically reduce to the same string. */
function normalizeLatexForDuplicate(latex: string): string {
  let out = latex ?? "";
  for (let i = 0; i < 5; i++) {
    const prev = out;
    out = out.replace(
      /\\(htmlClass|htmlId|cssId|textcolor|color)\{[^{}]*\}\{([^{}]*)\}/g,
      "$2",
    );
    if (out === prev) break;
  }
  // Drop \, \! \: \; spacing macros + braces left behind by stripping.
  out = out.replace(/\\[,!:;]/g, "");
  out = out.replace(/\s+/g, "");
  return out;
}

/** Bigram Jaccard similarity in [0,1] for two short strings. */
function bigramJaccard(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const A = grams(a);
  const B = grams(b);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Pull the displayed-math signature for a step, used for duplicate
 *  comparisons. Only write_math steps are compared today — that's where
 *  the user-reported near-identical pairs surface (an APPLY/STATE pair
 *  the model didn't collapse, or a State + an unphased write_math of the
 *  same equation). Returns null for steps with no math content. */
function dupSignature(step: WhiteboardStep): string | null {
  if (step.action?.type !== "write_math") return null;
  const latex = (step.action as { latex?: string }).latex ?? "";
  if (!latex.trim()) return null;
  return normalizeLatexForDuplicate(latex);
}

export function evaluateAdherence(steps: WhiteboardStep[]): AdherenceMetrics {
  const actionTypeHistogram: Record<string, number> = {};
  const operationHistogram: Record<string, number> = {};
  const roleHistogram = { "op-target": 0, "op-new": 0, "op-cancel": 0, "op-result": 0 };

  const invalidOperations: Array<{ stepId: number; value: string }> = [];
  const orphanedExpandingOps: AdherenceMetrics["orphanedExpandingOps"] = [];
  const brokenTriplets: AdherenceMetrics["brokenTriplets"] = [];
  const suspiciousNarrations: AdherenceMetrics["suspiciousNarrations"] = [];
  const displayNarrationMismatches: AdherenceMetrics["displayNarrationMismatches"] = [];
  const substitutionPatternViolations: AdherenceMetrics["substitutionPatternViolations"] = [];
  const outputContractViolations: AdherenceMetrics["outputContractViolations"] = [];
  const actionShapeViolations: AdherenceMetrics["actionShapeViolations"] = [];
  const nearDuplicateSteps: AdherenceMetrics["nearDuplicateSteps"] = [];

  // Sweep adjacent write_math steps for near-identical content. Two
  // consecutive equations rendering the same form back-to-back is
  // visually flat and pedagogically empty — the model should have
  // either collapsed them or moved on. We exclude pairs in the same
  // operationGroupId because triplet phases legitimately re-render the
  // same expression with different highlights.
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const cur = steps[i];
    if (prev.operationGroupId && prev.operationGroupId === cur.operationGroupId) continue;
    const a = dupSignature(prev);
    const b = dupSignature(cur);
    if (!a || !b) continue;
    if (a === b) {
      nearDuplicateSteps.push({
        prevStepId: prev.id,
        stepId: cur.id,
        severity: "strong",
        similarity: 1,
        reason: "consecutive write_math steps render identical math (after stripping role/color tags)",
      });
      continue;
    }
    // Skip the expensive bigram check on lopsided pairs — a much shorter
    // step is almost never a near-duplicate of a much longer one.
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    if (ratio < 0.7) continue;
    const sim = bigramJaccard(a, b);
    if (sim >= 0.92) {
      nearDuplicateSteps.push({
        prevStepId: prev.id,
        stepId: cur.id,
        severity: "weak",
        similarity: sim,
        reason: `consecutive write_math steps share ${(sim * 100).toFixed(0)}% bigrams (after stripping role/color tags)`,
      });
    }
  }

  // Count compact opt-outs by operation
  const compactByOperation: Partial<Record<MicroLessonOperation, { total: number; compact: number }>> = {};

  // Group steps by operationGroupId for triplet checking
  const groups: Record<string, WhiteboardStep[]> = {};

  let teachingStepCount = 0;
  let teachingOperationTagged = 0;
  let writeMathCount = 0;
  let writeMathTagged = 0;

  // Track longest consecutive teaching-step action.type run. Interaction
  // steps reset the run since they inherently break the visual cadence.
  let longestActionRun: AdherenceMetrics["longestActionRun"] = {
    type: "",
    length: 0,
    startStepId: -1,
    endStepId: -1,
  };
  const monotonyRuns: AdherenceMetrics["monotonyRuns"] = [];
  let runType = "";
  let runStart: WhiteboardStep | null = null;
  let runEnd: WhiteboardStep | null = null;
  let runLen = 0;
  const RUN_CAP = 4;
  const closeRun = () => {
    // Phase-tagged write_math chains (triplet waterfalls) are pedagogy
    // by design — never count them toward longestActionRun or monotonyRuns.
    const isPhasedChain = runType === "write_math_phased";
    if (!isPhasedChain && runLen > longestActionRun.length && runStart && runEnd) {
      longestActionRun = {
        type: runType,
        length: runLen,
        startStepId: runStart.id,
        endStepId: runEnd.id,
      };
    }
    if (!isPhasedChain && runLen > RUN_CAP && runStart && runEnd) {
      monotonyRuns.push({
        type: runType,
        length: runLen,
        startStepId: runStart.id,
        endStepId: runEnd.id,
      });
    }
    runType = "";
    runStart = null;
    runEnd = null;
    runLen = 0;
  };

  for (const step of steps) {
    const type = step.action?.type ?? "unknown";
    actionTypeHistogram[type] = (actionTypeHistogram[type] ?? 0) + 1;

    if (step.operation) {
      operationHistogram[step.operation] = (operationHistogram[step.operation] ?? 0) + 1;
      if (!VALID_OPS.has(step.operation)) {
        invalidOperations.push({ stepId: step.id, value: String(step.operation) });
      }
    }

    // For run tracking, treat phase-tagged write_math (triplet phases)
    // as a distinct action kind from unphased write_math. A continuous
    // triplet chain is a single equals-aligned visual waterfall — it
    // morphs in place via cross-fades, so it does NOT read as "monotony"
    // the way a sequence of unrelated bare equations does. closeRun()
    // skips reporting `write_math_phased` runs to longestActionRun and
    // monotonyRuns so the accept-gate trips only on unphased prose.
    const runKind: string =
      type === "write_math" && step.phase ? "write_math_phased" : type;

    if (isTeachingStep(step)) {
      teachingStepCount++;
      if (step.operation && VALID_OPS.has(step.operation)) teachingOperationTagged++;
      // Extend or restart the consecutive-same-kind run.
      if (runKind === runType && runLen > 0) {
        runLen++;
        runEnd = step;
      } else {
        closeRun();
        runType = runKind;
        runStart = step;
        runEnd = step;
        runLen = 1;
      }
    } else {
      // Interaction (or unknown) step breaks the run.
      closeRun();
    }

    if (step.action?.type === "write_math") {
      writeMathCount++;
      const latex = (step.action as { latex?: string }).latex ?? "";
      let hasTag = false;
      let m: RegExpExecArray | null;
      ROLE_REGEX.lastIndex = 0;
      while ((m = ROLE_REGEX.exec(latex))) {
        roleHistogram[m[1] as keyof typeof roleHistogram]++;
        hasTag = true;
      }
      if (hasTag) writeMathTagged++;
    }

    // Collect compact stats on expanding ops.
    if (step.operation && EXPANDING_OPS.has(step.operation)) {
      const slot = (compactByOperation[step.operation] ??= { total: 0, compact: 0 });
      slot.total++;
      if (step.compact) slot.compact++;
    }

    // Group by operationGroupId
    if (step.operationGroupId) {
      (groups[step.operationGroupId] ??= []).push(step);
    }

    // Orphan check: expanding op, not compact, but no groupId => orphan.
    if (
      step.operation &&
      EXPANDING_OPS.has(step.operation) &&
      !step.compact &&
      !step.operationGroupId
    ) {
      orphanedExpandingOps.push({
        stepId: step.id,
        operation: step.operation,
        reason: "expanding op has no operationGroupId and compact is not true",
      });
    }

    // Narration sanity on interaction steps.
    const narrationIssue = checkInteractionNarration(step);
    if (narrationIssue) {
      suspiciousNarrations.push({
        stepId: step.id,
        severity: narrationIssue.severity,
        narration: step.narration ?? "",
        reason: narrationIssue.reason,
      });
    }

    // Parity sanity on teaching steps.
    const parityIssue = checkDisplayNarrationParity(step);
    if (parityIssue) {
      displayNarrationMismatches.push({
        stepId: step.id,
        severity: parityIssue.severity,
        missingTokens: parityIssue.missing,
        reason: parityIssue.reason,
      });
    }

    // Substitution pattern check on substitute apply steps.
    const subIssue = checkSubstitutionPattern(step);
    if (subIssue) {
      substitutionPatternViolations.push({
        stepId: step.id,
        severity: subIssue.severity,
        substitutionCount: subIssue.count,
        reason: subIssue.reason,
      });
    }

    // Output contract: displayText markdown+KaTeX shape, narration TTS shape.
    const contractIssue = checkOutputContract(step);
    if (contractIssue) {
      const display = (step.displayText ?? "").trim();
      const narration = (step.narration ?? "").trim();
      const failsDisplay = contractIssue.reasons.some((r) => r.startsWith("displayText"));
      const failsNarration = contractIssue.reasons.some((r) => r.startsWith("narration"));
      const field: "displayText" | "narration" | "both" =
        failsDisplay && failsNarration ? "both" :
        failsDisplay ? "displayText" :
        "narration";
      outputContractViolations.push({
        stepId: step.id,
        field,
        reasons: contractIssue.reasons,
      });
      // Mark used to suppress unused-var warnings if either side is empty
      void display; void narration;
    }

    const shapeIssues = checkActionShape(step);
    if (shapeIssues) {
      actionShapeViolations.push({
        stepId: step.id,
        actionType: String(step.action?.type ?? "unknown"),
        reasons: shapeIssues,
      });
    }
  }
  // Close the trailing run (loop ended without flushing).
  closeRun();

  // Triplet integrity: each group should have exactly one apply, collapse, state
  // — in that order by step index — with a consistent operation on the APPLY step.
  let tripletCount = 0;
  for (const [groupId, members] of Object.entries(groups)) {
    members.sort((a, b) => a.id - b.id);
    const phases = members.map((m) => m.phase);
    const expected = ["apply", "collapse", "state"];
    const phaseSet = new Set(phases.filter(Boolean) as string[]);
    const hasAll = expected.every((p) => phaseSet.has(p));
    const inOrder = phases.filter(Boolean).join(",") === expected.join(",");
    const applyStep = members.find((m) => m.phase === "apply");

    if (hasAll && inOrder && applyStep?.operation && EXPANDING_OPS.has(applyStep.operation)) {
      tripletCount++;
    } else {
      brokenTriplets.push({
        groupId,
        stepIds: members.map((m) => m.id),
        reason: !hasAll
          ? `missing phases: present=[${phases.filter(Boolean).join(",")}]`
          : !inOrder
            ? `phases out of order: [${phases.join(",")}]`
            : `apply step has no expanding operation: operation=${applyStep?.operation}`,
      });
    }
  }

  // Expected triplets: expanding-op APPLY steps (or orphan expanding ops that
  // weren't compact — they're also "expected" but will have been flagged above).
  const expectedTripletCount = steps.reduce((n, s) => {
    if (!s.operation || !EXPANDING_OPS.has(s.operation)) return n;
    if (s.compact) return n;
    if (s.phase === "apply") return n + 1;
    // Expanding op without phase=apply: still "expected" but counts as orphaned.
    if (!s.operationGroupId) return n + 1;
    return n;
  }, 0);

  // Compact rate aggregates
  const compactStepsTotal = steps.reduce((n, s) => n + (s.compact ? 1 : 0), 0);
  const compactRateOverall = steps.length ? compactStepsTotal / steps.length : 0;
  const compactByOp: Partial<Record<MicroLessonOperation, number>> = {};
  const flaggedOps: MicroLessonOperation[] = [];
  for (const [op, slot] of Object.entries(compactByOperation)) {
    if (!slot) continue;
    const rate = slot.total ? slot.compact / slot.total : 0;
    compactByOp[op as MicroLessonOperation] = rate;
    // Threshold 0.5: substitute legitimately lacks a collapse phase when
    // many variables are substituted at once (e.g. slope formula), so a
    // strict threshold punishes honest authoring. Lower bound still catches
    // a model marking nearly every op compact.
    // Also require a minimum sample size so a single compact op in a
    // 2-op lesson doesn't immediately flag.
    if (slot.total >= 3 && rate > 0.5) flaggedOps.push(op as MicroLessonOperation);
  }

  const taggedOperationPct = teachingStepCount ? teachingOperationTagged / teachingStepCount : 0;
  const taggedLatexPct = writeMathCount ? writeMathTagged / writeMathCount : 0;

  // Conclude presence: lesson must land its takeaway, EITHER with at
  // least one `conclude`-tagged step (math-style numeric answer beat),
  // OR by ending the lesson on an interaction (check_in / predict /
  // fill_blank — the "now you try" close that reading/writing lessons
  // naturally use because there's no numeric answer to land). Without
  // this OR, the gate over-fires on every English subtopic, where the
  // model correctly closes with an ASSESS check_in but emits no
  // `conclude` operation. Position-agnostic for the explicit conclude
  // path (ideal lessons sometimes place a final practice interaction
  // after the conclude beat); the interaction-ending path naturally
  // requires the interaction to be the LAST step.
  const concludeStepIds = steps
    .filter((s) => s.operation === "conclude")
    .map((s) => s.id);
  const lastStep = steps[steps.length - 1];
  const lastIsInteraction =
    !!lastStep &&
    (lastStep.action?.type === "check_in" ||
      lastStep.action?.type === "predict" ||
      lastStep.action?.type === "fill_blank");
  const concludeInfo = {
    count: concludeStepIds.length,
    stepIds: concludeStepIds,
    missing: concludeStepIds.length === 0 && !lastIsInteraction,
  };

  // Section-heading presence (SOFT signal). A real lesson should mark its
  // phases — TEACH / VERIFY / ASSESS or similar — with section_heading
  // steps so students have visual chunking anchors. v1 just measures: a
  // small score nudge, no accept-gate impact. Threshold is 2 because a
  // lesson with only a single heading isn't really chunked.
  const sectionHeadingStepIds = steps
    .filter((s) => s.action?.type === "section_heading")
    .map((s) => s.id);
  const sectionHeadingsInfo = {
    count: sectionHeadingStepIds.length,
    stepIds: sectionHeadingStepIds,
    sparse: sectionHeadingStepIds.length < 2,
  };

  // Word-problem structural enforcement. Count structured uses, then
  // detect write_text steps that look like word problems in disguise.
  // The latter is the backstop signal — if the model emits a scenario
  // as raw prose instead of using the word_problem action, we've lost
  // the layout guarantee and need to know about it.
  const wordProblemStepIds = steps
    .filter((s) => s.action?.type === "word_problem")
    .map((s) => s.id);
  const unstructuredWordProblems = detectUnstructuredWordProblems(steps);
  const danglingOrbFocus = detectDanglingOrbFocus(steps);

  // Simple composite adherence score in [0,1].
  const tripletRatio = expectedTripletCount
    ? Math.min(1, tripletCount / expectedTripletCount)
    : 1;
  const orphanPenalty = orphanedExpandingOps.length
    ? Math.min(1, orphanedExpandingOps.length / 5)
    : 0;
  const brokenPenalty = brokenTriplets.length ? Math.min(1, brokenTriplets.length / 5) : 0;
  const compactPenalty = compactRateOverall > 0.2 ? 0.15 : 0;
  const invalidPenalty = invalidOperations.length ? 0.2 : 0;
  const rawScore =
    0.35 * tripletRatio +
    0.25 * taggedOperationPct +
    0.2 * taggedLatexPct +
    0.2 * (1 - orphanPenalty * 0.5 - brokenPenalty * 0.5);
  const score = Math.max(0, rawScore - compactPenalty - invalidPenalty);

  // Narration penalties. Strong flags each cost a meaningful score bump; weak
  // flags are a nudge.
  const strongNarrations = suspiciousNarrations.filter((n) => n.severity === "strong").length;
  const weakNarrations = suspiciousNarrations.filter((n) => n.severity === "weak").length;
  const narrationPenalty =
    strongNarrations * 0.08 + weakNarrations * 0.02;
  const strongMismatches = displayNarrationMismatches.filter((m) => m.severity === "strong").length;
  const weakMismatches = displayNarrationMismatches.filter((m) => m.severity === "weak").length;
  const parityPenalty = strongMismatches * 0.04 + weakMismatches * 0.01;
  // Visual monotony: each step over the 4-step soft cap on a same-type
  // run costs 0.02, capped at 0.1 so monotony is meaningful but not
  // dominant against more structural failures.
  const monotonyPenalty = Math.min(
    0.1,
    monotonyRuns.reduce((s, r) => s + (r.length - RUN_CAP) * 0.02, 0),
  );
  const strongSubs = substitutionPatternViolations.filter((s) => s.severity === "strong").length;
  const weakSubs = substitutionPatternViolations.filter((s) => s.severity === "weak").length;
  const subPatternPenalty = strongSubs * 0.04 + weakSubs * 0.01;
  // Each contract violation is severe — it breaks the rendered UI
  // visibly (raw LaTeX, mangled prose). 0.05 per violation, capped.
  const contractPenalty = Math.min(0.2, outputContractViolations.length * 0.05);
  // Action shape violations crash the renderer; weight them at parity
  // with output-contract violations.
  const shapePenalty = Math.min(0.2, actionShapeViolations.length * 0.05);
  // Near-duplicate consecutive steps. Strong (identical) is worth more
  // than weak (high-similarity-but-not-equal). Capped because a single
  // duplicate isn't lesson-killing, but a stack of them is.
  const strongDupes = nearDuplicateSteps.filter((d) => d.severity === "strong").length;
  const weakDupes = nearDuplicateSteps.filter((d) => d.severity === "weak").length;
  const duplicatePenalty = Math.min(0.12, strongDupes * 0.04 + weakDupes * 0.015);
  // Missing-conclude is structural: the lesson never names its takeaway.
  // 0.08 — meaningful but smaller than a broken triplet.
  const concludePenalty = concludeInfo.missing ? 0.08 : 0;
  // Sparse section headings: SOFT signal only — a small nudge, no hard
  // gate. 0.04 when the lesson has zero headings, 0.02 when it has one
  // (sparse but at least chunked once). Capped at 0.04.
  const sectionHeadingPenalty = sectionHeadingsInfo.count === 0
    ? 0.04
    : sectionHeadingsInfo.sparse
      ? 0.02
      : 0;
  const finalScore = Math.max(
    0,
    score - narrationPenalty - parityPenalty - monotonyPenalty - subPatternPenalty - contractPenalty - shapePenalty - duplicatePenalty - concludePenalty - sectionHeadingPenalty,
  );

  return {
    stepCount: steps.length,
    actionTypeHistogram,
    operationHistogram,
    taggedOperationPct,
    taggedLatexPct,
    roleHistogram,
    tripletCount,
    expectedTripletCount,
    orphanedExpandingOps,
    invalidOperations,
    brokenTriplets,
    suspiciousNarrations,
    displayNarrationMismatches,
    longestActionRun,
    monotonyRuns,
    substitutionPatternViolations,
    outputContractViolations,
    actionShapeViolations,
    nearDuplicateSteps,
    danglingOrbFocus,
    compactRate: {
      overall: compactRateOverall,
      byOperation: compactByOp,
      flaggedOverall: compactRateOverall > 0.2,
      flaggedOperations: flaggedOps,
    },
    conclude: concludeInfo,
    sectionHeadings: sectionHeadingsInfo,
    wordProblems: {
      count: wordProblemStepIds.length,
      stepIds: wordProblemStepIds,
      unstructuredCandidates: unstructuredWordProblems,
    },
    score: finalScore,
  };
}

/** Brief human-readable summary for terminal output. */
export function summarizeAdherence(m: AdherenceMetrics): string {
  const issues: string[] = [];
  if (m.expectedTripletCount && m.tripletCount < m.expectedTripletCount) {
    issues.push(`triplets: ${m.tripletCount}/${m.expectedTripletCount}`);
  }
  if (m.orphanedExpandingOps.length) {
    issues.push(`${m.orphanedExpandingOps.length} orphaned op(s)`);
  }
  if (m.brokenTriplets.length) {
    issues.push(`${m.brokenTriplets.length} broken triplet(s)`);
  }
  if (m.invalidOperations.length) issues.push(`${m.invalidOperations.length} invalid operation(s)`);
  const strongSus = m.suspiciousNarrations.filter((n) => n.severity === "strong").length;
  const weakSus = m.suspiciousNarrations.filter((n) => n.severity === "weak").length;
  if (strongSus) issues.push(`${strongSus} narration(s) leak the answer`);
  if (weakSus) issues.push(`${weakSus} non-question narration(s)`);
  const strongPar = m.displayNarrationMismatches.filter((p) => p.severity === "strong").length;
  const weakPar = m.displayNarrationMismatches.filter((p) => p.severity === "weak").length;
  if (strongPar) issues.push(`${strongPar} display/narration parity gap(s)`);
  if (weakPar) issues.push(`${weakPar} display/narration partial gap(s)`);
  if (m.longestActionRun.length > 4) {
    issues.push(
      `longest run: ${m.longestActionRun.length} ${m.longestActionRun.type} (steps ${m.longestActionRun.startStepId}–${m.longestActionRun.endStepId})`,
    );
  }
  const strongSubV = m.substitutionPatternViolations.filter((s) => s.severity === "strong").length;
  const weakSubV = m.substitutionPatternViolations.filter((s) => s.severity === "weak").length;
  if (strongSubV) issues.push(`${strongSubV} oversize substitution(s) without animation`);
  if (weakSubV) issues.push(`${weakSubV} single substitution(s) without arrow`);
  if (m.outputContractViolations.length) {
    issues.push(`${m.outputContractViolations.length} output-contract violation(s)`);
  }
  const strongDup = m.nearDuplicateSteps.filter((d) => d.severity === "strong").length;
  const weakDup = m.nearDuplicateSteps.filter((d) => d.severity === "weak").length;
  if (strongDup) issues.push(`${strongDup} duplicate consecutive step(s)`);
  if (weakDup) issues.push(`${weakDup} near-duplicate consecutive step(s)`);
  if (m.danglingOrbFocus.length) issues.push(`${m.danglingOrbFocus.length} dangling orb pointer(s)`);
  if (m.compactRate.flaggedOverall) issues.push(`compact rate ${(m.compactRate.overall * 100).toFixed(0)}%`);
  if (m.compactRate.flaggedOperations.length) {
    issues.push(`over-compact ops: ${m.compactRate.flaggedOperations.join(",")}`);
  }
  if (m.conclude.missing) issues.push(`missing conclude step`);
  if (m.sectionHeadings.sparse) {
    issues.push(`${m.sectionHeadings.count} section heading(s)`);
  }
  if (m.wordProblems.unstructuredCandidates.length) {
    issues.push(
      `${m.wordProblems.unstructuredCandidates.length} unstructured word problem(s)`,
    );
  }
  const issuesStr = issues.length ? ` · issues: ${issues.join("; ")}` : "";
  return `adherence=${m.score.toFixed(2)} steps=${m.stepCount} triplets=${m.tripletCount}/${m.expectedTripletCount} tagged=${(m.taggedOperationPct * 100).toFixed(0)}%${issuesStr}`;
}
