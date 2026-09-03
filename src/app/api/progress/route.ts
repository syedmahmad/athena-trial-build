import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { getProgressData } from "@/lib/db/queries/progress";
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

  const data = await getProgressData(user.id);

  return NextResponse.json({
    user: {
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      targetScore: user.targetScore ?? null,
      skillScore: user.skillScore ?? null,
    },
    ...data,
  });
}
