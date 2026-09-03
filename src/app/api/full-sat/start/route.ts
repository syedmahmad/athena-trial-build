import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import {
  getLastCompletedAttempt,
  getInProgressAttempt,
  createAttempt,
  getTestProblems,
  createAnswerRows,
  getAttemptAnswers,
} from "@/lib/db/queries/full-sat";
import { FULL_SAT_COOLDOWN_MS } from "@/types/full-sat";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { testId } = (await req.json()) as { testId: string };
  if (!testId) {
    return NextResponse.json({ error: "testId is required" }, { status: 400 });
  }

  // Check for existing in-progress attempt — resume it
  const existing = await getInProgressAttempt(user.id);
  if (existing) {
    const problems = await getTestProblems(existing.testId);
    const answers = await getAttemptAnswers(existing.id);

    // Strip correctOption for the client
    const clientProblems = problems.map(({ correctOption, ...rest }) => rest);

    return NextResponse.json({
      attemptId: existing.id,
      test: {
        id: existing.testId,
        testNumber: 0, // will be resolved on client via tests list
        name: "",
        status: "active",
        createdAt: "",
      },
      problems: clientProblems,
      answers,
    });
  }

  // Enforce cooldown
  const lastCompleted = await getLastCompletedAttempt(user.id);
  if (lastCompleted?.completedAt) {
    const elapsed = Date.now() - new Date(lastCompleted.completedAt).getTime();
    if (elapsed < FULL_SAT_COOLDOWN_MS) {
      const nextDate = new Date(
        new Date(lastCompleted.completedAt).getTime() + FULL_SAT_COOLDOWN_MS
      ).toISOString();
      return NextResponse.json(
        { error: "Cooldown active", nextAvailableDate: nextDate },
        { status: 403 }
      );
    }
  }

  // Load test problems
  const problems = await getTestProblems(testId);
  if (problems.length === 0) {
    return NextResponse.json(
      { error: "Test has no problems" },
      { status: 404 }
    );
  }

  // Create attempt and answer placeholders
  const attempt = await createAttempt(user.id, testId);
  await createAnswerRows(attempt.id, problems);
  const answers = await getAttemptAnswers(attempt.id);

  // Strip correctOption for the client
  const clientProblems = problems.map(({ correctOption, ...rest }) => rest);

  return NextResponse.json({
    attemptId: attempt.id,
    test: {
      id: testId,
      testNumber: 0,
      name: "",
      status: "active",
      createdAt: "",
    },
    problems: clientProblems,
    answers,
  });
}
