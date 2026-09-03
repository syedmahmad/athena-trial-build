/**
 * Runtime mirror of the eval's output-contract check (see
 * `src/lib/evals/adherence.ts:checkOutputContract`). Run on chat
 * `wb_step` payloads as they stream in so we surface contract
 * violations in dev console immediately, instead of finding them as
 * raw-LaTeX visual bugs in the rendered chat.
 *
 * Producers (chat agent, lesson agent) must emit content that's already
 * correct for each consumer (markdown+KaTeX vs TTS). This function
 * doesn't transform — it only flags.
 */

export type OutputContractViolation = {
  reasons: string[];
};

/** Find STRICT paired `$...$` math spans: content non-whitespace at
 *  boundaries, ≤100 chars, no newlines, BOTH delimiters unescaped (so
 *  `\$` doesn't get treated as a span closer and lock in currency
 *  runaway). Currency runaway like `$30 per month plus $0.10` doesn't
 *  match (content ends with whitespace), so the bare-currency check
 *  below catches the `$30`. */
function strictMathRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /(?<!\\)\$([^\s$][^$\n]{0,100}[^\s$])(?<!\\)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function inAnyRange(pos: number, ranges: Array<[number, number]>): boolean {
  for (const [s, e] of ranges) if (pos >= s && pos < e) return true;
  return false;
}

export function checkOutputContract(
  displayText: string | undefined | null,
  narration: string | undefined | null,
): OutputContractViolation | null {
  const reasons: string[] = [];
  const display = (displayText ?? "").trim();
  const narrationText = (narration ?? "").trim();

  if (display) {
    // Balanced `$` count.
    let dollars = 0;
    for (let i = 0; i < display.length; i++) {
      if (display[i] === "$" && display[i - 1] !== "\\") dollars++;
    }
    if (dollars % 2 !== 0) {
      reasons.push("displayText has unbalanced `$` delimiters");
    }
    // Bare currency `$<digit>`, but only when OUTSIDE a real math
    // span. `$80\%$` would otherwise false-fire since `\` isn't in
    // `[\d.,$]` after `80`.
    const ranges = strictMathRanges(display);
    const bareCurrency = /(?<!\\)\$\d[\d.,]*(?![\d.,$])/g;
    let cm: RegExpExecArray | null;
    while ((cm = bareCurrency.exec(display)) !== null) {
      if (!inAnyRange(cm.index, ranges)) {
        reasons.push("displayText has bare `$<digit>` outside math (use `\\$X` for currency)");
        break;
      }
    }
    // Bare LaTeX commands outside math spans.
    let outside = "";
    let cursor = 0;
    for (const [s, e] of ranges) {
      outside += display.slice(cursor, s);
      cursor = e;
    }
    outside += display.slice(cursor);
    if (/\\textcolor\b/.test(outside)) {
      reasons.push("displayText uses `\\textcolor` outside `$...$`");
    }
    if (/\\(frac|sqrt|cdot|times|div|pi|sum|int)\b/.test(outside)) {
      reasons.push("displayText has bare LaTeX command outside `$...$`");
    }
  }

  if (narrationText) {
    if (/\$/.test(narrationText)) reasons.push("narration contains `$`");
    if (/\\/.test(narrationText)) reasons.push("narration contains `\\`");
    if (/[{}]/.test(narrationText)) reasons.push("narration contains `{` or `}`");
  }

  return reasons.length ? { reasons } : null;
}
