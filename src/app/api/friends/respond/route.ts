import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { supabase } from "@/lib/supabase/client";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { friendshipId, action } = await req.json();
  if (!friendshipId || (action !== "accept" && action !== "decline")) {
    return NextResponse.json({ error: "friendshipId and a valid action are required" }, { status: 400 });
  }

  const { data: friendship } = await supabase
    .from("friendships")
    .select("id, user_id, friend_user_id, status")
    .eq("id", friendshipId)
    .limit(1)
    .maybeSingle();

  if (!friendship || friendship.friend_user_id !== user.id || friendship.status !== "pending") {
    return NextResponse.json({ error: "Friend request not found" }, { status: 404 });
  }

  const newStatus = action === "accept" ? "accepted" : "declined";
  const { error: updateError } = await supabase
    .from("friendships")
    .update({ status: newStatus })
    .eq("id", friendshipId);

  if (updateError) {
    return NextResponse.json({ error: "Failed to update friend request" }, { status: 500 });
  }

  if (action === "accept") {
    // Mirror row so the dashboard's friendsScores query (which only reads
    // friendships.user_id = viewer AND status='accepted') also picks this up
    // for the person who was invited, without needing to change that query.
    await supabase
      .from("friendships")
      .insert({
        user_id: friendship.friend_user_id,
        friend_user_id: friendship.user_id,
        status: "accepted",
      });
  }

  return NextResponse.json({ status: newStatus });
}
