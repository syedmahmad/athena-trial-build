import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import {
  findStudentByEmail,
  getAssignmentForSubmit,
  linkStudentToUser,
  submitStudentWork,
  uploadSubmissionImages,
  type AssignmentQuestion,
  type SubmissionImageUpload,
} from "@/lib/db/queries/educators";
import { gateAccountAsHomeworkOnly } from "@/lib/db/queries/users";
import { gradePracticeAnswers, isPracticeSet } from "@/lib/educators";

const MAX_IMAGES = 3;
// ~4MB decoded per image (base64 inflates by 4/3).
const MAX_IMAGE_B64_CHARS = 5_600_000;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Doing homework requires a free Athena account (the GET share view stays
 * public). Identity comes from the signed-in user's email, matched against
 * the assignment-teacher's roster — never a posted email. On first submit we
 * link the roster entry to the account and gate the account as homework-only
 * (free homework, no free lessons). Resubmitting replaces prior work and
 * clears any grade; practice sets auto-grade on the spot.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json(
      { error: "Sign in to turn in your work." },
      { status: 401 }
    );
  }
  const account = await getAppUser(clerkId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const assignment = await getAssignmentForSubmit(id);
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    response?: string;
    answers?: number[];
    images?: SubmissionImageUpload[];
  };

  // The signed-in account's email is the identity — must be on this
  // teacher's roster.
  const student = await findStudentByEmail(assignment.teacherId, account.email);
  if (!student) {
    return NextResponse.json(
      {
        error: `${account.email} isn't on the class roster yet. Ask your teacher to add this email, then try again.`,
      },
      { status: 404 }
    );
  }

  // Link the roster entry to this account, and (only for brand-new accounts)
  // mark it homework-only so the rich learning experience stays gated.
  await linkStudentToUser(student.id, account.id);
  await gateAccountAsHomeworkOnly(account.id);

  // Multiple-choice practice sets auto-grade objectively here. Free-response
  // quizzes (kind:"free") and text homework both fall through to the AI path.
  const questions = assignment.questions;
  if (questions && isPracticeSet(questions)) {
    const answers = body.answers;
    if (
      !Array.isArray(answers) ||
      answers.length !== questions.length ||
      answers.some((a) => !Number.isInteger(a) || a < 0)
    ) {
      return NextResponse.json(
        { error: "Answer every question before submitting." },
        { status: 400 }
      );
    }
    const { grade, correctCount, total } = gradePracticeAnswers(
      questions as AssignmentQuestion[],
      answers
    );
    await submitStudentWork({
      assignmentId: assignment.id,
      studentId: student.id,
      userId: account.id,
      response: null,
      answers,
      images: null,
      grade,
      feedback: `Auto-graded: ${correctCount}/${total} correct.`,
    });
    return NextResponse.json({
      ok: true,
      studentName: student.name,
      graded: { grade, correctCount, total },
    });
  }

  const response = body.response?.trim() ?? "";
  const images = body.images ?? [];
  if (!response && images.length === 0) {
    return NextResponse.json(
      { error: "Write your answer or add a photo of your work." },
      { status: 400 }
    );
  }
  if (response.length > 20_000) {
    return NextResponse.json({ error: "Answer is too long." }, { status: 400 });
  }
  if (
    images.length > MAX_IMAGES ||
    images.some(
      (img) =>
        !ALLOWED_MIME.has(img.mediaType) ||
        typeof img.data !== "string" ||
        img.data.length === 0 ||
        img.data.length > MAX_IMAGE_B64_CHARS
    )
  ) {
    return NextResponse.json(
      { error: `Up to ${MAX_IMAGES} photos, 4MB each (JPEG/PNG/WebP).` },
      { status: 400 }
    );
  }

  let imagePaths: string[] | null = null;
  if (images.length) {
    try {
      imagePaths = await uploadSubmissionImages(
        assignment.id,
        student.id,
        images
      );
    } catch (err) {
      console.error("[educators/submit] image upload failed:", err);
      return NextResponse.json(
        { error: "Could not upload photos. Try again." },
        { status: 503 }
      );
    }
  }

  await submitStudentWork({
    assignmentId: assignment.id,
    studentId: student.id,
    userId: account.id,
    response: response || null,
    answers: null,
    images: imagePaths,
    grade: null,
    feedback: null,
  });
  return NextResponse.json({ ok: true, studentName: student.name });
}
