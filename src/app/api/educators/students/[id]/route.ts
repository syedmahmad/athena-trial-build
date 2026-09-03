import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import { deleteStudent, updateStudent } from "@/lib/db/queries/educators";

/** Edit a student (name / emails / class). Omitted fields are unchanged;
 *  `classId: null` unassigns. */
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
    name?: string;
    studentEmail?: string;
    parentEmail?: string;
    classId?: string | null;
  };
  if (body.name !== undefined && !body.name.trim()) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
  }
  if (body.studentEmail !== undefined && !body.studentEmail.trim()) {
    return NextResponse.json(
      { error: "studentEmail cannot be empty" },
      { status: 400 }
    );
  }
  const updated = await updateStudent(user.id, id, {
    name: body.name?.trim(),
    studentEmail: body.studentEmail?.trim(),
    parentEmail: body.parentEmail?.trim(),
    classId: body.classId,
  });
  if (!updated) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }
  return NextResponse.json({ student: updated });
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
  await deleteStudent(user.id, id);
  return NextResponse.json({ ok: true });
}
