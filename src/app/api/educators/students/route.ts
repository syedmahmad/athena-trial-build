import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import { createStudent, listStudents } from "@/lib/db/queries/educators";

export async function GET() {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const students = await listStudents(user.id);
  return NextResponse.json({ students });
}

export async function POST(req: Request) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    name?: string;
    studentEmail?: string;
    parentEmail?: string;
    classId?: string | null;
  };
  if (!body.name?.trim() || !body.studentEmail?.trim() || !body.parentEmail?.trim()) {
    return NextResponse.json(
      { error: "name, studentEmail, and parentEmail are required" },
      { status: 400 }
    );
  }

  const student = await createStudent({
    teacherId: user.id,
    name: body.name.trim(),
    studentEmail: body.studentEmail.trim(),
    parentEmail: body.parentEmail.trim(),
    classId: body.classId ?? null,
  });
  return NextResponse.json({ student });
}
