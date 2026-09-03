import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { getDashboardData } from "@/lib/db/queries/dashboard";
import { NextResponse } from "next/server";

export async function GET() {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const data = await getDashboardData(user.id);

  return NextResponse.json({
    user: {
      displayName: user.displayName,
      skillScore: user.skillScore,
      avatarUrl: user.avatarUrl,
      targetScore: user.targetScore ?? null,
    },
    ...data,
  });
}
