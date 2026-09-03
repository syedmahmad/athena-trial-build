import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import {
  createMicroLessonSession,
  updateMicroLessonSession,
} from "@/lib/db/queries/tracking";
import { NextResponse } from "next/server";

// POST: create a new micro-lesson session
export async function POST(req: Request) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { microLessonId, subtopicId, totalSteps } = await req.json();
  if (!microLessonId || !subtopicId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const session = await createMicroLessonSession({
    userId: user.id,
    microLessonId,
    subtopicId,
    totalSteps: totalSteps ?? 0,
  });

  return NextResponse.json({ sessionId: session.id });
}

// PATCH: update an existing session (heartbeat or end)
export async function PATCH(req: Request) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    sessionId,
    durationSeconds,
    stepsViewed,
    checkinsCorrect,
    checkinsTotal,
    chatMessages,
    ended,
    completed,
  } = await req.json();

  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  await updateMicroLessonSession(sessionId, {
    durationSeconds,
    stepsViewed,
    checkinsCorrect,
    checkinsTotal,
    chatMessages,
    ended,
    completed,
  });

  return NextResponse.json({ ok: true });
}
