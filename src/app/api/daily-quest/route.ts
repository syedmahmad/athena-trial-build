import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { getTodaysQuestWithDetails } from "@/lib/db/queries/daily-quest";
import { generateQuestForDate } from "@/lib/adaptive/generate-quest";
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

  // Check if quest exists for today
  let result = await getTodaysQuestWithDetails(user.id);

  // Auto-generate if no quest exists yet
  if (!result) {
    try {
      const today = new Date().toISOString().split("T")[0];
      await generateQuestForDate(user.id, today, user.currentComposite);
      result = await getTodaysQuestWithDetails(user.id);
    } catch (e) {
      console.error("Failed to auto-generate quest:", e);
    }
  }

  return NextResponse.json({
    quest: result?.quest ?? null,
    problems: result?.problems ?? null,
  });
}
