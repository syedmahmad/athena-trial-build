import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { getQuestionById, recordQuizAttempt } from "@/lib/db/queries/quiz";
import { upsertOnboardingProgress } from "@/lib/db/queries/onboarding";
import { addToLearningQueue } from "@/lib/db/queries/learning-queue";
import { upsertUserPreferences } from "@/lib/db/queries/preferences";
import { getLessonByProblemId } from "@/lib/db/queries/lessons";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getAppUser(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json();
  const {
    questionId,
    selectedOption,
    timeSpentSeconds,
    lessonPreference,
    nextIndex,
  } = body as {
    questionId: string;
    selectedOption: number;
    timeSpentSeconds?: number;
    lessonPreference?: "view_now" | "queue_for_later";
    nextIndex: number;
  };

  const question = await getQuestionById(questionId);
  if (!question) {
    return NextResponse.json(
      { error: "Question not found" },
      { status: 404 }
    );
  }

  // Preference-only update (no new attempt)
  if (selectedOption === -1) {
    if (lessonPreference) {
      await upsertUserPreferences(user.id, {
        lessonDelivery: lessonPreference,
      });
    }
    return NextResponse.json({ preferenceUpdated: true });
  }

  const isCorrect = selectedOption === question.correctOption;

  await recordQuizAttempt({
    userId: user.id,
    questionId,
    selectedOption,
    isCorrect,
    timeSpentSeconds,
  });

  await upsertOnboardingProgress(user.id, {
    quizQuestionIndex: nextIndex,
  });

  let lessonId: string | null = null;
  if (!isCorrect) {
    const lesson = await getLessonByProblemId(questionId);
    if (lesson) {
      lessonId = lesson.id;
      await addToLearningQueue({
        userId: user.id,
        lessonId: lesson.id,
        addedDuring: "onboarding",
      });
    }
  }

  if (lessonPreference) {
    await upsertUserPreferences(user.id, {
      lessonDelivery: lessonPreference,
    });
  }

  return NextResponse.json({
    isCorrect,
    correctOption: question.correctOption,
    explanation: question.explanation,
    lessonId,
  });
}
