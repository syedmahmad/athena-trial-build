import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import {
  deleteAssignment,
  getPublicAssignment,
  updateAssignment,
} from "@/lib/db/queries/educators";

/**
 * Public by design: students open assignments via an unguessable share link
 * (/educators/a/[id]) without signing in. Only the four student-facing
 * fields are returned.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const assignment = await getPublicAssignment(id);
  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ assignment });
}

/** Teacher edit of title / instructions / answer key / due date. */
export async function PATCH(
  req: Request,
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
  const body = (await req.json()) as {
    title?: string;
    instructions?: string;
    answerKey?: string | null;
    classId?: string | null;
    assignedDate?: string;
    dueDate?: string;
  };
  if (body.title !== undefined && !body.title.trim()) {
    return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
  }
  if (body.instructions !== undefined && !body.instructions.trim()) {
    return NextResponse.json(
      { error: "instructions cannot be empty" },
      { status: 400 }
    );
  }

  const assignment = await updateAssignment(user.id, id, {
    title: body.title?.trim(),
    instructions: body.instructions?.trim(),
    answerKey:
      body.answerKey === undefined ? undefined : body.answerKey?.trim() || null,
    classId: body.classId,
    assignedDate: body.assignedDate,
    dueDate: body.dueDate,
  });
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }
  return NextResponse.json({ assignment });
}

export async function DELETE(
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
  await deleteAssignment(user.id, id);
  return NextResponse.json({ ok: true });
}
