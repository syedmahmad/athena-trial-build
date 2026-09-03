import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import {
  getAssignment,
  listSubmissionsForTeacher,
  type AssignmentQuestion,
} from "@/lib/db/queries/educators";
import { OPTION_LETTERS, isPracticeSet } from "@/lib/educators";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

/**
 * Class-level AI insight on one assignment: how the class did and what they
 * likely struggled with. Built from REAL (non-simulated) graded submissions
 * only. Practice sets contribute per-question wrong-rates; text homework
 * contributes a sample of graded responses.
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

  const body = (await req.json()) as { assignmentId?: string };
  if (!body.assignmentId) {
    return NextResponse.json({ error: "assignmentId is required" }, { status: 400 });
  }

  const assignment = await getAssignment(user.id, body.assignmentId);
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  const graded = (await listSubmissionsForTeacher(user.id)).filter(
    (s) => s.assignmentId === assignment.id && !s.simulated && s.grade !== null
  );
  if (graded.length === 0) {
    return NextResponse.json(
      { error: "No graded work yet — grade some submissions first." },
      { status: 409 }
    );
  }

  const grades = graded.map((s) => s.grade as number);
  const gradeStats = {
    count: grades.length,
    avg: Math.round(grades.reduce((a, b) => a + b, 0) / grades.length),
    min: Math.min(...grades),
    max: Math.max(...grades),
  };

  // Practice sets: per-question correctness + most-common wrong option.
  let questionStats: unknown[] = [];
  let responses: unknown[] = [];
  if (isPracticeSet(assignment.questions)) {
    questionStats = (assignment.questions as AssignmentQuestion[]).map((q, qi) => {
      const chosen = graded
        .map((s) => s.answers?.[qi])
        .filter((a): a is number => typeof a === "number");
      const correct = chosen.filter((a) => a === q.correctIndex).length;
      const wrongCounts = new Map<number, number>();
      chosen
        .filter((a) => a !== q.correctIndex)
        .forEach((a) => wrongCounts.set(a, (wrongCounts.get(a) ?? 0) + 1));
      const topWrong = [...wrongCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        question: qi + 1,
        prompt: q.prompt,
        correct_answer: OPTION_LETTERS[q.correctIndex],
        correct_count: correct,
        total: chosen.length,
        most_common_wrong:
          topWrong && OPTION_LETTERS[topWrong[0]]
            ? `${OPTION_LETTERS[topWrong[0]]} (${topWrong[1]}×)`
            : null,
      };
    });
  } else {
    // Text homework: a sample of graded responses (cap to keep tokens sane).
    responses = graded
      .filter((s) => s.response?.trim())
      .slice(0, 15)
      .map((s) => ({
        grade: s.grade,
        response: (s.response ?? "").slice(0, 600),
      }));
  }

  try {
    const res = await fetch(`${AGENT_URL}/educator/assignment-insight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: assignment.title,
        instructions: assignment.instructions,
        answer_key: assignment.answerKey,
        is_practice: !!assignment.questions,
        grade_stats: gradeStats,
        question_stats: questionStats,
        responses,
      }),
    });
    if (!res.ok) {
      const errorBody = await res.text().catch(() => "no body");
      console.error(`[educators/insight] Agent returned ${res.status}:`, errorBody);
      throw new Error(`Agent service returned ${res.status}`);
    }
    const insight = (await res.json()) as {
      headline: string;
      struggles: string[];
      suggestion: string;
    };
    return NextResponse.json({ insight, gradedCount: graded.length });
  } catch (err) {
    console.error("[educators/insight] Error:", err);
    return NextResponse.json(
      { error: "Insight is currently unavailable. Please try again." },
      { status: 503 }
    );
  }
}
