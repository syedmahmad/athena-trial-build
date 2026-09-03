import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { getAllSubsectionSkills } from "@/lib/db/queries/subsection-skills";
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

  const skills = await getAllSubsectionSkills(user.id);

  return NextResponse.json({ skills });
}
