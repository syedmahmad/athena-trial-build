import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { upsertOnboardingProgress } from "@/lib/db/queries/onboarding";
import { upsertUserPreferences } from "@/lib/db/queries/preferences";
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
  const { name, grade, learnerTypes, interests, strugglingTopic } = body;

  await upsertUserPreferences(user.id, {
    name,
    grade,
    learnerTypes,
    interests,
    strugglingTopic,
  });

  await upsertOnboardingProgress(user.id, { currentStep: "quiz" });

  return NextResponse.json({ success: true });
}
