import { getAuthIdentity } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";

/**
 * Proxy to the agents service `/math-equiv` endpoint. Used by the
 * fill_blank comparator (`src/lib/answer-equivalence.ts`) as a last-
 * resort algebraic-equivalence check after sync string + numeric
 * passes fail. The agents service runs sympy via the same shim the
 * offline evaluator uses (`agents/eval_math_shim.py`), so it handles
 * commutativity, distribution, factoring, side-swapped equations,
 * inequalities, and compound relations.
 *
 * Failure modes are recoverable — on any non-2xx or network error,
 * return `equivalent: false`. The client falls back to "not correct"
 * and the student tries again. We don't surface the error to the
 * student because a sympy hiccup shouldn't look like a wrong answer.
 */

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

type MathEquivBody = {
  user: string;
  candidates: string[];
};

export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: MathEquivBody;
  try {
    body = (await req.json()) as MathEquivBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (
    typeof body.user !== "string" ||
    !Array.isArray(body.candidates) ||
    !body.candidates.every((c) => typeof c === "string")
  ) {
    return NextResponse.json(
      { error: "Body must be { user: string, candidates: string[] }" },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${AGENT_URL}/math-equiv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: body.user,
        candidates: body.candidates,
      }),
      // Tight timeout — the sympy check should be <100ms in practice.
      // If the service is slow or down, fall through to a benign
      // "no match" response on the client.
      signal: AbortSignal.timeout(2500),
    });

    if (!res.ok) {
      console.error(
        `[math-equiv] Agent returned ${res.status}:`,
        await res.text().catch(() => "no body"),
      );
      return NextResponse.json(
        { equivalent: false, matched: null, unparseable: false },
        { status: 200 },
      );
    }

    const data = (await res.json()) as {
      equivalent: boolean;
      matched: string | null;
      unparseable?: boolean;
    };
    return NextResponse.json({
      equivalent: !!data.equivalent,
      matched: data.matched ?? null,
      unparseable: !!data.unparseable,
    });
  } catch (err) {
    console.error("[math-equiv] Error:", err);
    // Soft failure — the comparator falls back to "not equivalent" so
    // the student isn't marked correct on a network blip. Status 200
    // so the client doesn't surface this as an error toast.
    return NextResponse.json(
      { equivalent: false, matched: null, unparseable: false },
      { status: 200 },
    );
  }
}
