import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import { saveCustomQuizSession } from "@/lib/db/queries/custom-learning";

export async function POST(req: Request) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    topicId: string;
    score: number;
    totalQuestions: number;
    timeElapsedSeconds: number;
    answers: { questionId: string; selectedOption: number; isCorrect: boolean }[];
  };

  const { topicId, score, totalQuestions, timeElapsedSeconds, answers } = body;

  if (
    !topicId ||
    score == null ||
    !totalQuestions ||
    timeElapsedSeconds == null ||
    !Array.isArray(answers)
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const session = await saveCustomQuizSession({
    userId: user.id,
    topicId,
    score,
    totalQuestions,
    timeElapsedSeconds,
    answers,
  });

  return NextResponse.json({ sessionId: session.id });
}
