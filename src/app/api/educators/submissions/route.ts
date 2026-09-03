import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import {
  getAssignment,
  getStudent,
  listSubmissionsForTeacher,
  saveSubmissionEdit,
} from "@/lib/db/queries/educators";

export async function GET() {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const submissions = await listSubmissionsForTeacher(user.id);
  return NextResponse.json({ submissions });
}

/** Manual grade/feedback edit from the grading drawer. */
export async function PUT(req: Request) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    assignmentId?: string;
    studentId?: string;
    grade?: number | null;
    teacherFeedback?: string;
  };
  if (!body.assignmentId || !body.studentId) {
    return NextResponse.json(
      { error: "assignmentId and studentId are required" },
      { status: 400 }
    );
  }
  if (
    body.grade !== null &&
    body.grade !== undefined &&
    (!Number.isFinite(body.grade) || body.grade < 0 || body.grade > 100)
  ) {
    return NextResponse.json({ error: "grade must be 0-100" }, { status: 400 });
  }

  // Ownership check: both the assignment and the student must belong to
  // this teacher.
  const [assignment, student] = await Promise.all([
    getAssignment(user.id, body.assignmentId),
    getStudent(user.id, body.studentId),
  ]);
  if (!assignment || !student) {
    return NextResponse.json(
      { error: "Assignment or student not found" },
      { status: 404 }
    );
  }

  const submission = await saveSubmissionEdit({
    assignmentId: body.assignmentId,
    studentId: body.studentId,
    grade: body.grade ?? null,
    teacherFeedback: body.teacherFeedback ?? "",
  });
  return NextResponse.json({ submission });
}
