import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { getOnboardingProgress } from "@/lib/db/queries/onboarding";
import { NextResponse } from "next/server";

export async function GET() {
  const { userId } = await getAuthIdentity();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getAppUser(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found in DB" }, { status: 404 });
  }

  // Onboarding state drives the SAT-surface positioning flow; the main app
  // ignores it.
  const onboarding = await getOnboardingProgress(user.id);

  return NextResponse.json({ user, onboarding });
}
