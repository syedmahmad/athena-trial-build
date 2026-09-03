import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { getStuckPoints } from "@/lib/db/queries/analytics";
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

  const stuckPoints = await getStuckPoints(user.id);

  const stuckThreshold = 3;
  const strongThreshold = 80;

  return NextResponse.json({
    stuckPoints,
    summary: {
      totalSubtopicsAttempted: stuckPoints.length,
      stuckCount: stuckPoints.filter((s) => s.stuckScore > stuckThreshold).length,
      strongCount: stuckPoints.filter((s) => s.metrics.accuracy >= strongThreshold).length,
      needsAttentionCount: stuckPoints.filter(
        (s) => s.stuckScore <= stuckThreshold && s.metrics.accuracy < strongThreshold
      ).length,
    },
  });
}
