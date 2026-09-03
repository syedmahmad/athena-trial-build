/**
 * Near-duplicate detection for question stems, shared by the problem-stream
 * orchestrator route (server) and the streaming-problems hook (client). The
 * agents-side generator has an equivalent Python implementation — keep the
 * three in sync if the normalization changes.
 */

/** Tokenize a stem: drop LaTeX commands/delimiters, reduce punctuation to
 *  spaces, lowercase. */
export function stemTokens(text: string): Set<string> {
  const t = text
    .toLowerCase()
    .replace(/\\[a-z]+/g, " ") // latex commands: \frac, \cdot, …
    .replace(/[${}\\]/g, " ") // latex delimiters / braces
    .replace(/[^a-z0-9]+/g, " ") // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
  return new Set(t.split(" ").filter(Boolean));
}

/** True if `tokens` overlaps any prior stem at/above `threshold` (Jaccard). */
export function tooSimilar(
  tokens: Set<string>,
  prior: Set<string>[],
  threshold = 0.6
): boolean {
  if (tokens.size === 0) return false;
  for (const p of prior) {
    if (p.size === 0) continue;
    let inter = 0;
    for (const tok of tokens) if (p.has(tok)) inter++;
    const union = tokens.size + p.size - inter;
    if (union > 0 && inter / union >= threshold) return true;
  }
  return false;
}
