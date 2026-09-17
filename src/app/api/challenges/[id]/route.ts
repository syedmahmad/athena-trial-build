import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { getChallengeById, getProblemsByIds } from "@/lib/db/queries/challenges";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
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
  const result = await getChallengeById(id);
  if (!result) {
    return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
  }
  const { challenge, attempts, problemIds } = result;

  if (challenge.challengerId !== user.id && challenge.opponentId !== user.id) {
    return NextResponse.json({ error: "Not a participant in this challenge" }, { status: 403 });
  }

  // The actual enforcement point: the problem set (and therefore the
  // questions) simply cannot be fetched before the scheduled time, not just
  // hidden behind a disabled button.
  if (challenge.status === "pending" || challenge.status === "declined") {
    return NextResponse.json({ challenge, attempts });
  }
  if (Date.now() < new Date(challenge.scheduledAt).getTime()) {
    return NextResponse.json(
      { challenge, attempts, startsAt: challenge.scheduledAt },
      { status: 200 }
    );
  }

  const problems = await getProblemsByIds(problemIds);

  // Score is only meaningful to reveal to the client once both sides have
  // submitted — strip it from in-progress attempts belonging to the other
  // participant so a peek at the response can't leak a live lead.
  const bothSubmitted = attempts.length === 2 && attempts.every((a) => a.submittedAt);
  const sanitizedAttempts = attempts.map((a) =>
    bothSubmitted || a.userId === user.id ? a : { ...a, score: null }
  );

  return NextResponse.json({
    challenge,
    attempts: sanitizedAttempts,
    problems: problems.map((p) => ({
      id: p.id,
      questionText: p.question_text,
      options: p.options,
      timeRecommendationSeconds: p.time_recommendation_seconds,
    })),
  });
}
