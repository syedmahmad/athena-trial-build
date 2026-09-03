import { auth, currentUser } from "@clerk/nextjs/server";
import { createUser, getUserByClerkId } from "@/lib/db/queries/users";
import { sendEmail } from "@/lib/email/send";
import { welcomeEmailHtml } from "@/lib/email/templates";
import { isSupabaseAuth } from "@/lib/auth/provider";
import { NextResponse } from "next/server";

export async function POST() {
  // In Supabase-auth mode, the on_auth_user_created DB trigger provisions the
  // app user — this Clerk-specific sync is a no-op.
  if (isSupabaseAuth()) {
    return NextResponse.json({ ok: true, skipped: "supabase-auth" });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clerkUser = await currentUser();
  if (!clerkUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const existingUser = await getUserByClerkId(clerkUser.id);
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";
  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    undefined;

  const user = await createUser({
    clerkId: clerkUser.id,
    email,
    displayName,
    avatarUrl: clerkUser.imageUrl || undefined,
  });

  if (!existingUser && email) {
    const { subject, html } = welcomeEmailHtml({
      displayName: displayName || "there",
    });
    sendEmail({ to: email, subject, html }).catch(console.error);
  }

  return NextResponse.json({ user });
}
