import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import {
  getChallengeById,
  getMyAttempt,
  submitChallengeAttempt,
} from "@/lib/db/queries/challenges";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { id } = await params;
  const { answers, timeElapsedSeconds } = await req.json();
  if (!Array.isArray(answers)) {
    return NextResponse.json({ error: "answers is required" }, { status: 400 });
  }

  const result = await getChallengeById(id);
  if (!result) {
    return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
  }
  const { challenge } = result;

  if (challenge.challengerId !== user.id && challenge.opponentId !== user.id) {
    return NextResponse.json({ error: "Not a participant in this challenge" }, { status: 403 });
  }
  if (challenge.status !== "scheduled" && challenge.status !== "completed") {
    return NextResponse.json({ error: `Challenge cannot be submitted (${challenge.status})` }, { status: 409 });
  }
  if (Date.now() < new Date(challenge.scheduledAt).getTime()) {
    return NextResponse.json({ error: "Too early — challenge hasn't started yet" }, { status: 403 });
  }

  const myAttempt = await getMyAttempt(id, user.id);
  if (!myAttempt) {
    return NextResponse.json({ error: "Not a participant in this challenge" }, { status: 403 });
  }
  if (myAttempt.submitted_at) {
    return NextResponse.json({ error: "You already submitted this challenge" }, { status: 409 });
  }

  const { score } = await submitChallengeAttempt(
    id,
    user.id,
    answers,
    timeElapsedSeconds ?? 0
  );

  return NextResponse.json({ score });
}
