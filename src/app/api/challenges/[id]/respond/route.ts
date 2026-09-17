import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { getChallengeById, acceptChallenge, declineChallenge } from "@/lib/db/queries/challenges";
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
  const { action } = await req.json();
  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "action must be 'accept' or 'decline'" }, { status: 400 });
  }

  const result = await getChallengeById(id);
  if (!result) {
    return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
  }
  const { challenge } = result;

  if (challenge.opponentId !== user.id) {
    return NextResponse.json({ error: "Only the challenged friend can respond" }, { status: 403 });
  }
  if (challenge.status !== "pending") {
    return NextResponse.json({ error: `Challenge is no longer pending (${challenge.status})` }, { status: 409 });
  }

  if (action === "accept") {
    await acceptChallenge(id, challenge.challengerId, challenge.opponentId);
  } else {
    await declineChallenge(id);
  }

  return NextResponse.json({ status: action === "accept" ? "scheduled" : "declined" });
}
