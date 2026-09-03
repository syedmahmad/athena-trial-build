import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import { getAssignment, listStudents } from "@/lib/db/queries/educators";
import { sendEmail } from "@/lib/email/send";
import { assignmentEmailHtml } from "@/lib/email/templates";
import { formatLongDate } from "@/lib/educators";

/**
 * Email the assignment share link to the rostered students. Students only:
 * we email each student's school email (the same identity they sign in with
 * to submit). Recipients are scoped to the assignment's class; an assignment
 * with no class goes to the whole roster. Replies route back to the teacher.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId: externalId } = await getAuthIdentity();
  if (!externalId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getAppUser(externalId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { id } = await params;
  const assignment = await getAssignment(user.id, id);
  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const roster = await listStudents(user.id);
  const recipients = roster.filter(
    (s) =>
      s.studentEmail.trim().length > 0 &&
      (assignment.classId ? s.classId === assignment.classId : true)
  );

  const base = process.env.APP_URL ?? new URL(req.url).origin;
  const link = `${base}/educators/a/${assignment.id}`;
  const dueDisplay = assignment.dueDate
    ? formatLongDate(assignment.dueDate)
    : undefined;

  let sent = 0;
  let failed = 0;
  for (const s of recipients) {
    const { subject, html } = assignmentEmailHtml({
      studentName: s.name || undefined,
      teacherName: user.displayName || undefined,
      assignmentTitle: assignment.title,
      dueDate: dueDisplay,
      link,
    });
    try {
      const res = await sendEmail({
        to: s.studentEmail,
        subject,
        html,
        replyTo: user.email || undefined,
      });
      // A null result means sending is disabled (no RESEND_API_KEY).
      if (res) sent++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({
    sent,
    failed,
    total: recipients.length,
    skipped: roster.length - recipients.length,
  });
}
