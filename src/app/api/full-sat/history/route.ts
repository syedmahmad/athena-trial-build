import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { getUserAttempts } from "@/lib/db/queries/full-sat";
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

  const attempts = await getUserAttempts(user.id);

  return NextResponse.json({ attempts });
}
