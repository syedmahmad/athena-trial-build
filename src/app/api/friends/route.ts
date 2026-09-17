import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { supabase } from "@/lib/supabase/client";
import { NextResponse } from "next/server";

type UserInfo = { display_name: string | null; avatar_url: string | null };

export async function GET() {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [friendsRes, incomingRes] = await Promise.all([
    supabase
      .from("friendships")
      .select("friend_user_id, users!friend_user_id(display_name, avatar_url)")
      .eq("user_id", user.id)
      .eq("status", "accepted"),
    supabase
      .from("friendships")
      .select("id, user_id, created_at, users!user_id(display_name, avatar_url)")
      .eq("friend_user_id", user.id)
      .eq("status", "pending"),
  ]);

  const friends = (friendsRes.data ?? []).map((f) => {
    const info = f.users as UserInfo | null;
    return {
      id: f.friend_user_id,
      displayName: info?.display_name ?? null,
      avatarUrl: info?.avatar_url ?? null,
    };
  });

  const incoming = (incomingRes.data ?? []).map((r) => {
    const info = r.users as UserInfo | null;
    return {
      friendshipId: r.id,
      fromUserId: r.user_id,
      displayName: info?.display_name ?? null,
      avatarUrl: info?.avatar_url ?? null,
      createdAt: r.created_at,
    };
  });

  return NextResponse.json({ friends, incoming });
}
