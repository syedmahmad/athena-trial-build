import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { updateUserById } from "@/lib/db/queries/users";
import { upsertOnboardingProgress } from "@/lib/db/queries/onboarding";
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

  await upsertOnboardingProgress(user.id, { currentStep: "completed" });
  await updateUserById(user.id, { onboardingCompleted: true });

  return NextResponse.json({ ok: true });
}
