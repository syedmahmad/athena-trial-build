import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { supabase } from "@/lib/supabase/client";
import {
  createChallenge,
  getChallengesForUser,
  lockProblemIds,
} from "@/lib/db/queries/challenges";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const result = await getChallengesForUser(user.id);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { opponentUserId, subtopicId, questionCount, scheduledAt } = await req.json();

  if (!opponentUserId || !subtopicId || !questionCount || !scheduledAt) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (![5, 10, 15].includes(questionCount)) {
    return NextResponse.json({ error: "questionCount must be 5, 10, or 15" }, { status: 400 });
  }
  if (opponentUserId === user.id) {
    return NextResponse.json({ error: "Cannot challenge yourself" }, { status: 400 });
  }
  if (new Date(scheduledAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Scheduled time must be in the future" }, { status: 400 });
  }

  const { data: friendship } = await supabase
    .from("friendships")
    .select("id")
    .eq("user_id", user.id)
    .eq("friend_user_id", opponentUserId)
    .eq("status", "accepted")
    .limit(1)
    .maybeSingle();

  if (!friendship) {
    return NextResponse.json({ error: "You can only challenge an accepted friend" }, { status: 403 });
  }

  const problemIds = await lockProblemIds(subtopicId, questionCount);
  if (problemIds.length < questionCount) {
    return NextResponse.json(
      {
        error: `Not enough seeded questions for this subtopic yet (found ${problemIds.length}, need ${questionCount}). Try a smaller count or a different subtopic.`,
      },
      { status: 400 }
    );
  }

  const challengeId = await createChallenge({
    challengerId: user.id,
    opponentId: opponentUserId,
    subtopicId,
    questionCount,
    scheduledAt,
    problemIds,
  });

  return NextResponse.json({ challengeId });
}
