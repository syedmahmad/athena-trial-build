import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import {
  applySimulatedSubmission,
  findSubmission,
  getAssignment,
  getStudent,
} from "@/lib/db/queries/educators";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

/**
 * Explicit demo action: invent a plausible student response and grade it.
 * The result is stored with simulated=true so the UI badges it and real
 * statistics exclude it. Refuses to overwrite a real submission. Not
 * available for practice sets (those are objectively graded real answers).
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
  if (assignment.questions) {
    return NextResponse.json(
      { error: "Practice sets can't be simulated — students answer directly." },
      { status: 400 }
    );
  }
  const existing = await findSubmission(assignment.id, student.id);
  if (existing && !existing.simulated) {
    return NextResponse.json(
      { error: `${student.name} already has a real submission.` },
      { status: 409 }
    );
  }

  try {
    const res = await fetch(`${AGENT_URL}/educator/grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: assignment.title,
        instructions: assignment.instructions,
        answer_key: assignment.answerKey,
        student_name: student.name,
        simulate: true,
      }),
    });
    if (!res.ok) {
      const errorBody = await res.text().catch(() => "no body");
      console.error(`[educators/simulate] Agent returned ${res.status}:`, errorBody);
      throw new Error(`Agent service returned ${res.status}`);
    }
    const graded = (await res.json()) as {
      response: string;
      grade: number | null;
      feedback: string;
    };

    const submission = await applySimulatedSubmission({
      assignmentId: assignment.id,
      studentId: student.id,
      response: graded.response,
      grade: graded.grade,
      feedback: graded.feedback,
    });
    return NextResponse.json({ submission });
  } catch (err) {
    console.error("[educators/simulate] Error:", err);
    return NextResponse.json(
      { error: "Simulation is currently unavailable. Please try again." },
      { status: 503 }
    );
  }
}
