/**
 * Answer-equivalence helpers for fill_blank interactions.
 *
 * The author seeds `acceptedAnswers: string[]` per InteractionUnit. We
 * compare a student's typed input against that list with three passes,
 * cheapest first:
 *
 *   1. Case-insensitive string equality — covers single-symbol answers
 *      like "x", text labels, exact matches. Sync, O(1) per candidate.
 *   2. Numeric equivalence — both sides parse as numbers, and the
 *      values match within 1e-9. Covers:
 *        - "1/2" === "0.5"
 *        - "0.50" === "0.5"
 *        - ".5"  === "0.5"
 *        - "−3"  === "-3"      (unicode minus → ASCII)
 *        - "1,000" === "1000"  (thousands separator)
 *        - "3 " === "3"        (trailing whitespace)
 *      Sync, fast (regex + parseFloat).
 *   3. Algebraic equivalence (async) — hits `/api/agent/math-equiv`
 *      which proxies to the agents service's sympy-backed comparator.
 *      Covers:
 *        - "2x + 4" ≡ "4 + 2x"           (commutativity)
 *        - "2(x + 2)" ≡ "2x + 4"          (distribution)
 *        - "(x-1)(x+1)" ≡ "x^2 - 1"       (factoring)
 *        - "3 = x" ≡ "x = 3"              (side-swap equation)
 *        - LaTeX-wrapped inputs (\htmlClass / \textcolor) — same
 *          normalization as the offline evaluator
 *      Network roundtrip (~50-200ms in prod) — only paid when sync
 *      passes both fail.
 *
 * Sync callers (no algebra needed, or running outside React) should
 * use `isEquivalentAnswer`. The fill_blank UI uses
 * `isEquivalentAnswerAsync`, which waits on the algebraic check
 * before returning a final correct/wrong verdict.
 *
 * On any network failure, the algebraic path quietly returns false —
 * a flaky agents service should never look like a wrong answer to the
 * student. The proxy at `/api/agent/math-equiv/route.ts` surfaces the
 * error to the server logs only.
 */

/** Parse a numeric string into a `number`, or `null` if it's not a clean
 *  numeric literal. Tolerates unicode minuses, thousands separators,
 *  surrounding whitespace, and simple fractions `a/b`. */
export function parseNumericAnswer(raw: string): number | null {
  if (typeof raw !== "string") return null;
  const s = raw
    .trim()
    // Map unicode minus / hyphen variants to ASCII minus.
    .replace(/[−‐‑‒–—]/g, "-")
    // Strip thousands separators. (US convention — students authoring
    // European notation would type `1.000` for one thousand, which we
    // can't disambiguate from `1.000` decimal. Defer that until it
    // bites.)
    .replace(/,/g, "")
    // Strip internal whitespace so "− 3" works.
    .replace(/\s+/g, "");
  if (!s) return null;

  // Simple fraction: numerator/denominator (each optionally signed and
  // possibly a decimal).
  const fracMatch = s.match(
    /^(-?(?:\d+\.?\d*|\.\d+))\/(-?(?:\d+\.?\d*|\.\d+))$/,
  );
  if (fracMatch) {
    const num = Number.parseFloat(fracMatch[1]);
    const den = Number.parseFloat(fracMatch[2]);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
      return null;
    }
    return num / den;
  }

  // Plain integer or decimal. Allow `.5`, `5.`, `5`, `5.5`, signed.
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Two strings represent the same numeric value (within float tolerance). */
export function isNumericallyEquivalent(a: string, b: string): boolean {
  const na = parseNumericAnswer(a);
  const nb = parseNumericAnswer(b);
  if (na === null || nb === null) return false;
  // 1e-9 is comfortably below the smallest spread between fractional
  // forms a student would type ("0.333" vs "1/3" is ~3.3e-4, well above
  // the tolerance — we want those to count as different unless the
  // author seeded both).
  return Math.abs(na - nb) < 1e-9;
}

/** Expand a single answer string into the variants we'll accept as
 *  equivalent. Today that's:
 *    - the trimmed original
 *    - if it's shaped like `<single-letter> = <value>` (an equation
 *      that names what the value of the variable is), also the
 *      bare value
 *  Applied SYMMETRICALLY on both the student input and each accepted
 *  answer so the four combinations all match:
 *    typed "3"      vs accepted "3"
 *    typed "x = 3"  vs accepted "3"     ← regression the user hit
 *    typed "3"      vs accepted "x = 3"
 *    typed "x = 3"  vs accepted "x = 3"
 *  The single-letter restriction keeps `f(x) = 3` and other
 *  expressions out — only bare scalar-assignments collapse. */
function answerVariants(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  const variants = [t];
  // Match `var = value` where var is a single ASCII letter optionally
  // followed by a digit subscript ("x", "x_1", "y2"). The "value"
  // side can be anything non-empty.
  const m = t.match(/^([a-zA-Z](?:_\d+|\d)?)\s*=\s*(.+)$/);
  if (m && m[2].trim()) variants.push(m[2].trim());
  return variants;
}

/** Does `userInput` match any entry in `acceptedAnswers`? Tries
 *  case-insensitive string equality first, then numeric equivalence.
 *  Each side is expanded via `answerVariants` so `<var> = <value>`
 *  collapses to its scalar form on either side. Sync — does NOT
 *  consult the algebraic checker. */
export function isEquivalentAnswer(
  userInput: string,
  acceptedAnswers: readonly string[],
): boolean {
  const userVariants = answerVariants(userInput);
  if (userVariants.length === 0) return false;
  for (const a of acceptedAnswers) {
    const accVariants = answerVariants(a);
    for (const u of userVariants) {
      const ul = u.toLowerCase();
      for (const v of accVariants) {
        if (v.toLowerCase() === ul) return true;
        if (isNumericallyEquivalent(u, v)) return true;
      }
    }
  }
  return false;
}

/** POST `/api/agent/math-equiv`. Returns true iff sympy confirms the
 *  user's expression matches any of `acceptedAnswers` after algebraic
 *  normalization. Network failures, timeouts, and parse errors all
 *  return false (don't surface as wrong-answer to the student — the
 *  proxy logs the underlying error server-side). Override `fetcher`
 *  for tests. */
export async function isAlgebraicallyEquivalent(
  userInput: string,
  acceptedAnswers: readonly string[],
  fetcher: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  const trimmed = userInput.trim();
  if (!trimmed || acceptedAnswers.length === 0) return false;
  try {
    const res = await fetcher("/api/agent/math-equiv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: trimmed,
        candidates: acceptedAnswers,
      }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      equivalent?: boolean;
    };
    return data.equivalent === true;
  } catch {
    // Network blip / timeout / abort — fall through silently. The
    // student sees "not correct" rather than an error toast; better
    // UX than surfacing transport issues to them.
    return false;
  }
}

/** Async superset of `isEquivalentAnswer` — also consults the agents
 *  service's sympy comparator on any non-match from the sync passes.
 *  Use this for fill_blank interactions where algebraic forms (`1/2`
 *  vs `0.5`, `2x+4` vs `4+2x`, `2(x+2)` vs `2x+4`) should count as
 *  correct. */
export async function isEquivalentAnswerAsync(
  userInput: string,
  acceptedAnswers: readonly string[],
  fetcher: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  // Fast path — string + numeric. Most correct answers don't need the
  // network at all.
  if (isEquivalentAnswer(userInput, acceptedAnswers)) return true;
  // Slow path — algebraic via sympy.
  return isAlgebraicallyEquivalent(userInput, acceptedAnswers, fetcher);
}
