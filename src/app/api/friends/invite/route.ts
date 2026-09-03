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

  const { email } = await req.json();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const { data: friendUser } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();

  if (!friendUser) {
    return NextResponse.json({ error: "User not found with that email" }, { status: 404 });
  }

  if (friendUser.id === user.id) {
    return NextResponse.json({ error: "Cannot add yourself" }, { status: 400 });
  }

  // Check if friendship already exists
  const { data: existing } = await supabase
    .from("friendships")
    .select("id")
    .eq("user_id", user.id)
    .eq("friend_user_id", friendUser.id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "Friend request already exists" }, { status: 409 });
  }

  const { data: friendship } = await supabase
    .from("friendships")
    .insert({
      user_id: user.id,
      friend_user_id: friendUser.id,
      status: "pending",
    })
    .select()
    .single();

  return NextResponse.json({ friendship });
}
