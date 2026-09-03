import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import {
  applyAiGradeToSubmission,
  downloadWorkImageB64,
  findSubmission,
  getAssignment,
  getStudent,
  type AssignmentQuestion,
} from "@/lib/db/queries/educators";
import { gradePracticeAnswers, isPracticeSet } from "@/lib/educators";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

/**
 * Grade one student's existing submission. Requires real (or explicitly
 * simulated) work to exist — grading never invents a response. Practice-set
 * submissions are re-scored objectively without an LLM; text submissions go
 * through the AI grader, which only ever updates grade/feedback (the
 * student's response is never rewritten).
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

  const body = (await req.json()) as {
    assignmentId?: string;
    studentId?: string;
  };
  if (!body.assignmentId || !body.studentId) {
    return NextResponse.json(
      { error: "assignmentId and studentId are required" },
      { status: 400 }
    );
  }

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

  const submission = await findSubmission(assignment.id, student.id);

  // Multiple-choice practice sets: objective re-score, no LLM involved.
  // Free-response quizzes and text homework go through the AI grader below.
  const questions = assignment.questions;
  if (questions && isPracticeSet(questions)) {
    if (!submission?.answers) {
      return NextResponse.json(
        { error: `${student.name} hasn't submitted yet — nothing to grade.` },
        { status: 409 }
      );
    }
    const { grade, correctCount, total } = gradePracticeAnswers(
      questions as AssignmentQuestion[],
      submission.answers
    );
    const updated = await applyAiGradeToSubmission({
      submissionId: submission.id,
      grade,
      feedback: `Auto-graded: ${correctCount}/${total} correct.`,
    });
    return NextResponse.json({ submission: updated });
  }

  const hasText = !!submission?.response?.trim();
  const hasPhotos = !!submission?.images?.length;
  if (!submission || (!hasText && !hasPhotos)) {
    return NextResponse.json(
      { error: `${student.name} hasn't submitted yet — nothing to grade.` },
      { status: 409 }
    );
  }

  try {
    // Photos of handwritten work ride along as base64 vision blocks.
    const images = hasPhotos
      ? await Promise.all(
          (submission.images ?? []).map(async (p) => {
            const { mediaType, data } = await downloadWorkImageB64(p);
            return { media_type: mediaType, data };
          })
        )
      : [];

    const res = await fetch(`${AGENT_URL}/educator/grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: assignment.title,
        instructions: assignment.instructions,
        answer_key: assignment.answerKey,
        student_name: student.name,
        student_response: submission.response,
        images,
      }),
    });
    if (!res.ok) {
      const errorBody = await res.text().catch(() => "no body");
      console.error(`[educators/grade] Agent returned ${res.status}:`, errorBody);
      throw new Error(`Agent service returned ${res.status}`);
    }
    const graded = (await res.json()) as {
      grade: number | null;
      feedback: string;
    };

    const updated = await applyAiGradeToSubmission({
      submissionId: submission.id,
      grade: graded.grade,
      feedback: graded.feedback,
    });
    return NextResponse.json({ submission: updated });
  } catch (err) {
    console.error("[educators/grade] Error:", err);
    return NextResponse.json(
      { error: "Grading is currently unavailable. Please try again." },
      { status: 503 }
    );
  }
}
