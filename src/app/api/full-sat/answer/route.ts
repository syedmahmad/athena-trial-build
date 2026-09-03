import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import {
  upsertAnswer,
  updateAttemptPosition,
} from "@/lib/db/queries/full-sat";
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

  const body = await req.json();
  const {
    attemptId,
    problemId,
    section,
    module,
    orderIndex,
    selectedOption,
    isCorrect,
    responseTimeMs,
  } = body as {
    attemptId: string;
    problemId: string;
    section: string;
    module: number;
    orderIndex: number;
    selectedOption: number;
    isCorrect: boolean;
    responseTimeMs?: number;
  };

  if (!attemptId || !problemId || !section || module == null || orderIndex == null || selectedOption == null || isCorrect == null) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await upsertAnswer(attemptId, {
    problemId,
    section,
    module,
    orderIndex,
    selectedOption,
    isCorrect,
    responseTimeMs,
  });

  // Update resume position
  await updateAttemptPosition(attemptId, {
    currentSection: section,
    currentModule: module,
    currentQuestion: orderIndex,
  });

  return NextResponse.json({ ok: true });
}
