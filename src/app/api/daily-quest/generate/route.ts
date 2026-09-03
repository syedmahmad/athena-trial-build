import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { getTodaysQuestWithDetails } from "@/lib/db/queries/daily-quest";
import { generateQuestForDate } from "@/lib/adaptive/generate-quest";
import { NextResponse } from "next/server";

export async function POST() {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Check if quest already exists for today
  const existing = await getTodaysQuestWithDetails(user.id);
  if (existing) {
    return NextResponse.json(existing);
  }

  const today = new Date().toISOString().split("T")[0];
  const quest = await generateQuestForDate(
    user.id,
    today,
    user.currentComposite
  );

  if (!quest) {
    return NextResponse.json(
      { error: "Failed to generate quest" },
      { status: 500 }
    );
  }

  const result = await getTodaysQuestWithDetails(user.id);
  return NextResponse.json(result);
}
