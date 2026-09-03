import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import {
  createAssignment,
  listAssignments,
  type AssignmentQuestion,
  type FreeResponseQuestion,
  type QuizQuestion,
} from "@/lib/db/queries/educators";
import { isFreeResponseQuiz } from "@/lib/educators";

export async function GET() {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const assignments = await listAssignments(user.id);
  return NextResponse.json({ assignments });
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
    title?: string;
    instructions?: string;
    answerKey?: string | null;
    questions?: QuizQuestion[] | null;
    classId?: string | null;
    assignedDate?: string;
    dueDate?: string;
    source?: string;
    prompt?: string | null;
  };
  if (!body.title?.trim() || !body.instructions?.trim() || !body.dueDate) {
    return NextResponse.json(
      { error: "title, instructions, and dueDate are required" },
      { status: 400 }
    );
  }
  // Validate per question kind: free-response needs a prompt; multiple-choice
  // (problem-bank) needs options + a valid correctIndex.
  if (body.questions) {
    const qs = body.questions;
    const malformed =
      !Array.isArray(qs) ||
      qs.length === 0 ||
      (isFreeResponseQuiz(qs)
        ? qs.some((q) => !(q as FreeResponseQuestion).prompt?.trim())
        : qs.some((raw) => {
            const q = raw as AssignmentQuestion;
            return (
              !q.prompt ||
              !Array.isArray(q.options) ||
              q.options.length < 2 ||
              !Number.isInteger(q.correctIndex) ||
              q.correctIndex < 0 ||
              q.correctIndex >= q.options.length
            );
          }));
    if (malformed) {
      return NextResponse.json({ error: "Malformed questions" }, { status: 400 });
    }
  }

  const assignment = await createAssignment({
    teacherId: user.id,
    title: body.title.trim(),
    instructions: body.instructions.trim(),
    answerKey: body.answerKey?.trim() || null,
    questions: body.questions ?? null,
    classId: body.classId ?? null,
    assignedDate: body.assignedDate,
    dueDate: body.dueDate,
    source: body.source,
    prompt: body.prompt ?? null,
  });
  return NextResponse.json({ assignment });
}
