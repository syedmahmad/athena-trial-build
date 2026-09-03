import { describe, expect, it, vi } from "vitest";
import {
  isAlgebraicallyEquivalent,
  isEquivalentAnswer,
  isEquivalentAnswerAsync,
  isNumericallyEquivalent,
  parseNumericAnswer,
} from "@/lib/answer-equivalence";

/**
 * fill_blank's acceptedAnswers comparator. Three passes:
 *   1. Case-insensitive string equality (existing)
 *   2. Numeric equivalence (decimal/fraction normalization)
 *   3. Algebraic equivalence via /api/agent/math-equiv (sympy)
 *
 * The numeric pass catches the common-text cases. The algebraic pass
 * handles "2x+4" ≡ "4+2x", "2(x+2)" ≡ "2x+4", side-swapped equations,
 * etc., and is mocked here via the optional `fetcher` injection.
 */

describe("parseNumericAnswer", () => {
  it.each([
    ["3", 3],
    ["-3", -3],
    ["0.5", 0.5],
    ["0.50", 0.5],
    [".5", 0.5],
    ["5.", 5],
    ["1/2", 0.5],
    ["3/4", 0.75],
    ["-3/4", -0.75],
    ["1,000", 1000],
    ["1,000,000", 1_000_000],
    ["−3", -3], // unicode minus
    [" 3 ", 3], // surrounding whitespace
    ["− 3", -3], // unicode minus + internal whitespace
    ["−0.5", -0.5],
  ])("parses %j → %j", (input, expected) => {
    expect(parseNumericAnswer(input)).toBeCloseTo(expected, 12);
  });

  it.each([
    [""],
    [" "],
    ["x"],
    ["abc"],
    ["12abc"],
    ["1.2.3"],
    ["1/0"], // division by zero rejected
    ["/"],
    ["1//2"],
    ["--3"],
    ["."],
  ])("rejects %j", (input) => {
    expect(parseNumericAnswer(input)).toBeNull();
  });
});

describe("isNumericallyEquivalent", () => {
  it("treats decimal and fraction forms as equivalent", () => {
    expect(isNumericallyEquivalent("1/2", "0.5")).toBe(true);
    expect(isNumericallyEquivalent("0.50", "0.5")).toBe(true);
    expect(isNumericallyEquivalent(".5", "1/2")).toBe(true);
    expect(isNumericallyEquivalent("3/4", "0.75")).toBe(true);
  });

  it("handles unicode minus and thousands separators", () => {
    expect(isNumericallyEquivalent("−3", "-3")).toBe(true);
    expect(isNumericallyEquivalent("1,000", "1000")).toBe(true);
  });

  it("rejects non-numeric inputs", () => {
    expect(isNumericallyEquivalent("x", "x")).toBe(false);
    expect(isNumericallyEquivalent("", "")).toBe(false);
    expect(isNumericallyEquivalent("abc", "abc")).toBe(false);
  });

  it("rejects different numeric values", () => {
    expect(isNumericallyEquivalent("3", "4")).toBe(false);
    expect(isNumericallyEquivalent("0.5", "0.6")).toBe(false);
    expect(isNumericallyEquivalent("1/2", "1/3")).toBe(false);
  });
});

describe("isEquivalentAnswer", () => {
  it("matches via case-insensitive string equality (fast path)", () => {
    expect(isEquivalentAnswer("x", ["x"])).toBe(true);
    expect(isEquivalentAnswer("X", ["x"])).toBe(true);
    expect(isEquivalentAnswer("  x  ", ["x"])).toBe(true);
    expect(isEquivalentAnswer("none", ["None"])).toBe(true);
  });

  it("matches via numeric equivalence when string equality fails", () => {
    expect(isEquivalentAnswer("0.5", ["1/2"])).toBe(true);
    expect(isEquivalentAnswer("1/2", ["0.5"])).toBe(true);
    expect(isEquivalentAnswer("2.50", ["2.5"])).toBe(true);
    expect(isEquivalentAnswer("−3", ["-3"])).toBe(true);
    expect(isEquivalentAnswer("1,000", ["1000"])).toBe(true);
  });

  it("checks every entry in acceptedAnswers", () => {
    expect(isEquivalentAnswer("0.5", ["nope", "1/2", "other"])).toBe(true);
    expect(isEquivalentAnswer("yes", ["nope", "yes", "other"])).toBe(true);
  });

  it("rejects empty / whitespace input", () => {
    expect(isEquivalentAnswer("", ["x"])).toBe(false);
    expect(isEquivalentAnswer("   ", ["x"])).toBe(false);
  });

  it("rejects non-matching numeric inputs", () => {
    expect(isEquivalentAnswer("0.6", ["1/2"])).toBe(false);
    expect(isEquivalentAnswer("3", ["4"])).toBe(false);
  });

  it("rejects mismatched text inputs", () => {
    expect(isEquivalentAnswer("apple", ["banana"])).toBe(false);
    expect(isEquivalentAnswer("x", ["y"])).toBe(false);
  });

  it("does NOT handle algebraic commutativity (sync path) — algebra moved to async", () => {
    // The sync path is intentionally narrow — string + numeric only.
    // Algebraic equivalence lives in isEquivalentAnswerAsync, which
    // consults the agents service's sympy comparator. See the async
    // describe block below.
    expect(isEquivalentAnswer("4+2x", ["2x+4"])).toBe(false);
    expect(isEquivalentAnswer("2x+4", ["4+2x"])).toBe(false);
  });

  it("collapses `<var> = <value>` on either side (regression guard)", () => {
    // Typed "x = 3" should match accepted "3" — and the other three
    // combinations of the cross-product. Single-letter LHS only; this
    // is the scalar-assignment shape that voice + students naturally
    // produce.
    expect(isEquivalentAnswer("x = 3", ["3"])).toBe(true);
    expect(isEquivalentAnswer("3", ["x = 3"])).toBe(true);
    expect(isEquivalentAnswer("x = 3", ["x = 3"])).toBe(true);
    expect(isEquivalentAnswer("y=0.5", ["1/2"])).toBe(true); // numeric path on the value side
    expect(isEquivalentAnswer("X = 3", ["3"])).toBe(true); // case-insensitive
    // Subscript / single-digit subscript supported.
    expect(isEquivalentAnswer("x_1 = 3", ["3"])).toBe(true);
    expect(isEquivalentAnswer("y2 = 3", ["3"])).toBe(true);
  });

  it("does NOT collapse multi-character / expression LHS", () => {
    // Only single-letter (optionally subscripted) LHS — guards against
    // expressions accidentally collapsing.
    expect(isEquivalentAnswer("f(x) = 3", ["3"])).toBe(false);
    expect(isEquivalentAnswer("2x = 3", ["3"])).toBe(false);
    expect(isEquivalentAnswer("foo = 3", ["3"])).toBe(false);
  });
});

// ── Algebraic path (async, mocks `/api/agent/math-equiv`) ────────────

/** Build a `fetch`-shaped stub that returns a JSON body and tracks the
 *  request payload so tests can assert what was sent. */
function makeFetcher(
  response: { equivalent: boolean; matched?: string | null; unparseable?: boolean },
  init: { ok?: boolean; throwError?: unknown } = {},
) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetcher = (vi.fn(async (url: string, opts?: RequestInit) => {
    const body = opts?.body ? JSON.parse(String(opts.body)) : null;
    calls.push({ url, body });
    if (init.throwError !== undefined) {
      throw init.throwError;
    }
    return {
      ok: init.ok ?? true,
      json: async () => response,
    } as unknown as Response;
  }) as unknown) as typeof fetch;
  return { fetcher, calls };
}

describe("isAlgebraicallyEquivalent", () => {
  it("posts user + candidates to /api/agent/math-equiv", async () => {
    const { fetcher, calls } = makeFetcher({ equivalent: true, matched: "2x+4" });
    const ok = await isAlgebraicallyEquivalent("4+2x", ["2x+4"], fetcher);
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/agent/math-equiv");
    expect(calls[0].body).toEqual({
      user: "4+2x",
      candidates: ["2x+4"],
    });
  });

  it("returns true on `equivalent: true`", async () => {
    const { fetcher } = makeFetcher({ equivalent: true, matched: "x" });
    expect(await isAlgebraicallyEquivalent("x", ["x"], fetcher)).toBe(true);
  });

  it("returns false on `equivalent: false`", async () => {
    const { fetcher } = makeFetcher({ equivalent: false, matched: null });
    expect(await isAlgebraicallyEquivalent("y", ["x"], fetcher)).toBe(false);
  });

  it("returns false on non-2xx response (soft failure)", async () => {
    const { fetcher } = makeFetcher(
      { equivalent: true, matched: "x" },
      { ok: false },
    );
    expect(await isAlgebraicallyEquivalent("x", ["x"], fetcher)).toBe(false);
  });

  it("returns false on network failure (soft failure)", async () => {
    const { fetcher } = makeFetcher(
      { equivalent: true, matched: "x" },
      { throwError: new Error("network down") },
    );
    expect(await isAlgebraicallyEquivalent("x", ["x"], fetcher)).toBe(false);
  });

  it("returns false on empty input without making a request", async () => {
    const { fetcher, calls } = makeFetcher({ equivalent: false });
    expect(await isAlgebraicallyEquivalent("", ["x"], fetcher)).toBe(false);
    expect(await isAlgebraicallyEquivalent("   ", ["x"], fetcher)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("returns false on empty candidates without making a request", async () => {
    const { fetcher, calls } = makeFetcher({ equivalent: false });
    expect(await isAlgebraicallyEquivalent("x", [], fetcher)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("trims user input before posting", async () => {
    const { fetcher, calls } = makeFetcher({ equivalent: true, matched: "x" });
    await isAlgebraicallyEquivalent("  x  ", ["x"], fetcher);
    expect(calls[0].body).toEqual({ user: "x", candidates: ["x"] });
  });
});

describe("isEquivalentAnswerAsync", () => {
  it("returns true via sync string equality without hitting the network", async () => {
    const { fetcher, calls } = makeFetcher({ equivalent: false });
    expect(await isEquivalentAnswerAsync("x", ["x"], fetcher)).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("returns true via sync numeric equivalence without hitting the network", async () => {
    const { fetcher, calls } = makeFetcher({ equivalent: false });
    expect(await isEquivalentAnswerAsync("0.5", ["1/2"], fetcher)).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("falls through to algebraic check on sync miss", async () => {
    const { fetcher, calls } = makeFetcher({ equivalent: true, matched: "2x+4" });
    expect(await isEquivalentAnswerAsync("4+2x", ["2x+4"], fetcher)).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("returns false when both sync and algebraic checks fail", async () => {
    const { fetcher } = makeFetcher({ equivalent: false, matched: null });
    expect(await isEquivalentAnswerAsync("z", ["x", "y"], fetcher)).toBe(false);
  });

  it("returns false when algebraic check has a network failure", async () => {
    const { fetcher } = makeFetcher(
      { equivalent: false },
      { throwError: new Error("timeout") },
    );
    expect(await isEquivalentAnswerAsync("4+2x", ["2x+4"], fetcher)).toBe(false);
  });
});
