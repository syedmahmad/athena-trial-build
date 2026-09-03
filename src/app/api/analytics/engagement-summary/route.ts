import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { getEngagementSummary } from "@/lib/db/queries/analytics";
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

  const summary = await getEngagementSummary(user.id);
  return NextResponse.json(summary);
}
