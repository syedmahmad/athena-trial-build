/**
 * Render-time sanitizer for content destined for `MathContent`. Targets
 * one specific failure mode that keeps showing up in chat responses:
 * the agent emits a bare `$30` (currency) instead of `\$30`, which
 * remark-math interprets as an inline-math opener and corrupts the
 * downstream prose, often leaking raw LaTeX control sequences (e.g.
 * `\textcolor{...}{...}`) into the visible output.
 *
 * Strategy: identify well-formed inline math spans first, then escape
 * `$<digits>` only in the prose BETWEEN them. A span is well-formed
 * when (a) its opening `$` is unescaped, (b) its closing `$` is also
 * unescaped — `\$` is currency, not a closer — (c) the content has no
 * whitespace at the boundaries (rejects `$30 per month plus $0.10`-
 * style runaway), and (d) the content has no internal `$` or newline.
 * Real math like `$x^2$`, `$80\%$`, `$\frac{a}{b}$` matches; currency
 * runs and orphan `$` do not.
 */

const STRICT_MATH_RE = /(?<!\\)\$([^\s$][^$\n]{0,100}[^\s$])(?<!\\)\$/g;
const BARE_CURRENCY_RE = /(?<!\\)\$(\d[\d.,]*)(\$?)/g;

function findMathRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  STRICT_MATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = STRICT_MATH_RE.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function escapeBareCurrency(text: string): string {
  return text.replace(BARE_CURRENCY_RE, (_match, num: string, close: string) =>
    close ? `$${num}$` : `\\$${num}`,
  );
}

export function sanitizeMathContent(text: string): string {
  if (!text || !text.includes("$")) return text;
  const ranges = findMathRanges(text);
  if (ranges.length === 0) return escapeBareCurrency(text);
  let result = "";
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (cursor < start) result += escapeBareCurrency(text.slice(cursor, start));
    result += text.slice(start, end);
    cursor = end;
  }
  if (cursor < text.length) result += escapeBareCurrency(text.slice(cursor));
  return result;
}
