import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { updateUserById } from "@/lib/db/queries/users";
import {
  getUserQuizAttempts,
  getQuestionById,
  getQuizQuestions,
} from "@/lib/db/queries/quiz";
import { upsertOnboardingProgress } from "@/lib/db/queries/onboarding";
import { calculateSkillScore } from "@/lib/scoring";
import { NextResponse } from "next/server";

export async function POST() {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getAppUser(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [attempts, quizQuestions] = await Promise.all([
    getUserQuizAttempts(user.id),
    getQuizQuestions(),
  ]);

  const attemptsWithDifficulty = await Promise.all(
    attempts.map(async (a) => {
      const q = await getQuestionById(a.questionId);
      return { difficulty: q?.difficulty ?? "easy", isCorrect: a.isCorrect };
    })
  );

  const skillScore = calculateSkillScore(attemptsWithDifficulty);

  await updateUserById(user.id, { skillScore });
  await upsertOnboardingProgress(user.id, { currentStep: "schedule" });

  return NextResponse.json({
    skillScore,
    totalQuestions: quizQuestions.length,
    correctCount: attempts.filter((a) => a.isCorrect).length,
  });
}
