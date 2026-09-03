import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { updateUser } from "@/lib/db/queries/users";
import { saveSatQuizSession } from "@/lib/db/queries/sat-quiz";
import { insertQuizQuestionEvents } from "@/lib/db/queries/tracking";
import {
  getSubsectionSkill,
  upsertSubsectionSkill,
  initializeAllSkills,
} from "@/lib/db/queries/subsection-skills";
import { updateSkillAfterAnswer } from "@/lib/adaptive/engine";
import { supabase } from "@/lib/supabase/client";
import { NextResponse } from "next/server";
import type { SectionCategory } from "@/types/adaptive";

export async function POST(req: Request) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getAppUser(clerkId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json();
  const { subtopicId, score, totalQuestions, timeElapsedSeconds, answers, events } =
    body as {
      subtopicId: string;
      score: number;
      totalQuestions: number;
      timeElapsedSeconds: number;
      answers: {
        problemId: string;
        selectedOption: number;
        isCorrect: boolean;
        responseTimeMs?: number;
        wrongCount?: number;
        hintUsed?: boolean;
        tutorUsed?: boolean;
        practiceCompleted?: boolean;
      }[];
      events?: {
        problemId: string;
        eventType: string;
        responseTimeMs?: number;
        selectedOption?: number;
        wrongCount?: number;
        practiceProblemId?: string;
        timestamp: string;
      }[];
    };

  if (
    !subtopicId ||
    score == null ||
    !totalQuestions ||
    timeElapsedSeconds == null ||
    !Array.isArray(answers)
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const session = await saveSatQuizSession({
    userId: user.id,
    subtopicId,
    score,
    totalQuestions,
    timeElapsedSeconds,
    answers,
  });

  // Persist quiz question events (non-fatal)
  if (events && events.length > 0) {
    try {
      await insertQuizQuestionEvents(
        events.map((e) => ({
          sessionId: session.id,
          problemId: e.problemId,
          userId: user.id,
          eventType: e.eventType,
          responseTimeMs: e.responseTimeMs,
          selectedOption: e.selectedOption,
          wrongCount: e.wrongCount,
          practiceProblemId: e.practiceProblemId,
          timestamp: e.timestamp,
        }))
      );
    } catch (e) {
      console.error("Failed to save quiz question events:", e);
    }
  }

  // Update subsection skills for adaptive tracking
  try {
    // Look up subtopic's section category
    const { data: subtopicData } = await supabase
      .from("subtopics")
      .select("id, topics!inner(subject)")
      .eq("id", subtopicId)
      .limit(1)
      .single();

    if (subtopicData) {
      const topic = subtopicData.topics as unknown as { subject: string };
      const sectionCategory: SectionCategory =
        topic?.subject === "math" ? "Math" : "ReadingWriting";

      // Look up difficulty_level for each problem
      const problemIds = answers.map((a) => a.problemId);
      const { data: problems } = await (supabase as any)
        .from("problems")
        .select("id, difficulty_level")
        .in("id", problemIds) as { data: { id: string; difficulty_level: number }[] | null };

      const difficultyMap = new Map(
        (problems ?? []).map((p) => [p.id, p.difficulty_level as number])
      );

      // Get or initialize skill for this subtopic
      let skill = await getSubsectionSkill(user.id, subtopicId);
      if (!skill) {
        await initializeAllSkills(user.id);
        skill = await getSubsectionSkill(user.id, subtopicId);
      }

      if (skill) {
        let currentSkill = skill;
        let totalXpEarned = 0;

        for (const answer of answers) {
          const diffLevel = difficultyMap.get(answer.problemId) ?? 5;
          const mutations = updateSkillAfterAnswer(
            currentSkill,
            answer.isCorrect,
            diffLevel
          );
          totalXpEarned += mutations.xp - currentSkill.xp;
          currentSkill = { ...currentSkill, ...mutations };
        }

        await upsertSubsectionSkill(user.id, subtopicId, sectionCategory, {
          level: currentSkill.level,
          xp: currentSkill.xp,
          totalAttempts: currentSkill.totalAttempts,
          correctAttempts: currentSkill.correctAttempts,
          last10: currentSkill.last10,
          streakCorrect: currentSkill.streakCorrect,
          streakWrong: currentSkill.streakWrong,
          lastSeenAt: new Date().toISOString(),
        });

        // Update user's total XP
        if (totalXpEarned > 0) {
          await updateUser(clerkId, {
            totalXp: (user.totalXp ?? 0) + totalXpEarned,
          });
        }
      }
    }
  } catch (e) {
    // Don't fail the whole submission if skill tracking errors
    console.error("Failed to update subsection skills:", e);
  }

  // Compute current streak and update bestStreak if higher
  const { data: sessionHistory } = await supabase
    .from("sessions")
    .select("scheduled_date, status")
    .eq("user_id", user.id)
    .order("scheduled_date", { ascending: false })
    .limit(30);

  const completedHistory = (sessionHistory ?? [])
    .filter((s) => s.status === "completed")
    .sort(
      (a, b) =>
        new Date(b.scheduled_date).getTime() -
        new Date(a.scheduled_date).getTime()
    );

  let currentStreak = 0;
  if (completedHistory.length > 0) {
    currentStreak = 1;
    for (let i = 1; i < completedHistory.length; i++) {
      const curr = new Date(completedHistory[i].scheduled_date);
      const prev = new Date(completedHistory[i - 1].scheduled_date);
      const diffDays =
        (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays <= 7) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  if (currentStreak > (user.bestStreak ?? 0)) {
    await updateUser(clerkId, { bestStreak: currentStreak });
  }

  return NextResponse.json({ sessionId: session.id });
}
