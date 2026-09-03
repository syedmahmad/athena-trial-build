import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import {
  getStudent,
  listAssignments,
  listParentReports,
  listSubmissionsForTeacher,
  logParentReport,
} from "@/lib/db/queries/educators";
import { ymd } from "@/lib/educators";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

/** Report history for one student (newest first). */
export async function GET(req: Request) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "studentId is required" }, { status: 400 });
  }
  const reports = await listParentReports(user.id, studentId);
  return NextResponse.json({ reports });
}

/**
 * Log a parent report for the current period (month-to-date). The summary is
 * AI-written from the student's real graded work (template fallback when the
 * agent is unreachable); email delivery is not wired up yet — this records
 * the report so the UI can speak honestly about it.
 */
export async function POST(req: Request) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = (await req.json()) as { studentId?: string };
  if (!body.studentId) {
    return NextResponse.json({ error: "studentId is required" }, { status: 400 });
  }

  const student = await getStudent(user.id, body.studentId);
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Real, period-scoped work only — simulated demo submissions never reach
  // a parent summary.
  const [submissions, assignments] = await Promise.all([
    listSubmissionsForTeacher(user.id),
    listAssignments(user.id),
  ]);
  const titleById = new Map(assignments.map((a) => [a.id, a.title]));
  const periodWork = submissions.filter(
    (s) =>
      s.studentId === student.id &&
      !s.simulated &&
      s.submittedAt !== null &&
      new Date(s.submittedAt) >= periodStart
  );
  const graded = periodWork.filter((s) => s.grade !== null);
  const avg = graded.length
    ? Math.round(graded.reduce((sum, s) => sum + (s.grade ?? 0), 0) / graded.length)
    : null;

  // Honest fallback if the agent can't write the note.
  let summary = `${student.name} completed ${graded.length} assignment(s) this period${
    avg !== null ? `, average grade ${avg}%` : ""
  }.`;
  try {
    const res = await fetch(`${AGENT_URL}/educator/parent-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_name: student.name,
        period_start: ymd(periodStart),
        period_end: ymd(now),
        assignments: periodWork.map((s) => ({
          title: titleById.get(s.assignmentId) ?? "Assignment",
          grade: s.grade,
          feedback: s.teacherFeedback ?? s.feedback,
          turned_in: true,
        })),
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { summary?: string };
      if (data.summary?.trim()) summary = data.summary.trim();
    } else {
      console.error(`[educators/reports] Agent returned ${res.status}`);
    }
  } catch (err) {
    console.error("[educators/reports] Agent unreachable:", err);
  }

  await logParentReport({
    teacherId: user.id,
    studentId: student.id,
    periodStart: ymd(periodStart),
    periodEnd: ymd(now),
    summary,
  });
  return NextResponse.json({ ok: true, summary });
}
