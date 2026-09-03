import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { updateUser } from "@/lib/db/queries/users";
import {
  getUserSchedules,
  deleteUserSchedules,
  createSchedules,
} from "@/lib/db/queries/schedules";
import { createSessions, deleteFuturePendingSessions } from "@/lib/db/queries/sessions";
import { generateSessionDates } from "@/lib/schedule-utils";
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

  const schedules = await getUserSchedules(user.id);

  return NextResponse.json({
    schedules: schedules.map((s) => ({
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      isActive: s.isActive,
    })),
  });
}

export async function PUT(req: Request) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json();
  type DayOfWeek =
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday";

  const { slots, timezone } = body as {
    slots: {
      dayOfWeek: DayOfWeek;
      startTime: string;
      endTime: string;
    }[];
    timezone?: string;
  };

  if (!slots || slots.length === 0) {
    return NextResponse.json(
      { error: "At least one time slot is required" },
      { status: 400 }
    );
  }

  // Clear existing schedules and future pending sessions
  await Promise.all([
    deleteUserSchedules(user.id),
    deleteFuturePendingSessions(user.id),
  ]);

  // Create new schedules
  const createdSchedules = await createSchedules(
    slots.map((s) => ({
      userId: user.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
    }))
  );

  // Generate 4 weeks of sessions
  const sessionDates = generateSessionDates(
    createdSchedules.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek as DayOfWeek,
    })),
    4
  );

  await createSessions(
    sessionDates.map((s) => ({
      userId: user.id,
      scheduleId: s.scheduleId,
      scheduledDate: s.scheduledDate,
    }))
  );

  if (timezone) {
    await updateUser(clerkId, { timezone });
  }

  return NextResponse.json({
    schedules: createdSchedules.length,
    sessions: sessionDates.length,
  });
}
