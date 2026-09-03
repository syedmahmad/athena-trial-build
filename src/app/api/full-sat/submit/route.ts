import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { updateUser } from "@/lib/db/queries/users";
import {
  getAttemptAnswers,
  completeAttempt,
  getTestProblems,
} from "@/lib/db/queries/full-sat";
import {
  getSubsectionSkill,
  upsertSubsectionSkill,
  initializeAllSkills,
} from "@/lib/db/queries/subsection-skills";
import { updateSkillAfterAnswer } from "@/lib/adaptive/engine";
import { computeFullSatScore } from "@/lib/full-sat/scoring";
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
  const { attemptId, rwTimeSeconds, mathTimeSeconds } = body as {
    attemptId: string;
    rwTimeSeconds: number;
    mathTimeSeconds: number;
  };

  if (!attemptId) {
    return NextResponse.json({ error: "attemptId is required" }, { status: 400 });
  }

  // Fetch all answers for this attempt
  const answers = await getAttemptAnswers(attemptId);

  // Count correct per section
  let rwCorrect = 0;
  let rwTotal = 0;
  let mathCorrect = 0;
  let mathTotal = 0;

  for (const a of answers) {
    if (a.section === "reading_writing") {
      rwTotal++;
      if (a.isCorrect) rwCorrect++;
    } else {
      mathTotal++;
      if (a.isCorrect) mathCorrect++;
    }
  }

  // Compute scaled scores
  const { rwScaled, mathScaled, total } = computeFullSatScore(rwCorrect, mathCorrect);

  // Save completion
  await completeAttempt(attemptId, {
    rwRawScore: rwCorrect,
    rwScaledScore: rwScaled,
    mathRawScore: mathCorrect,
    mathScaledScore: mathScaled,
    totalScore: total,
    rwTimeSeconds: rwTimeSeconds ?? 0,
    mathTimeSeconds: mathTimeSeconds ?? 0,
    totalTimeSeconds: (rwTimeSeconds ?? 0) + (mathTimeSeconds ?? 0),
  });

  // Update subsection skills for adaptive tracking
  try {
    // Get the test's problem data for subtopic mapping
    const { data: attemptRow } = await (supabase as any)
      .from("full_sat_attempts")
      .select("test_id")
      .eq("id", attemptId)
      .single() as { data: { test_id: string } | null };

    if (attemptRow) {
      const problems = await getTestProblems(attemptRow.test_id);
      const problemMap = new Map(problems.map((p) => [p.problemId, p]));

      // Group answers by subtopic
      const bySubtopic = new Map<
        string,
        { isCorrect: boolean; difficultyLevel: number }[]
      >();

      for (const a of answers) {
        if (a.selectedOption == null) continue; // unanswered
        const problem = problemMap.get(a.problemId);
        if (!problem?.subtopicId) continue;

        const arr = bySubtopic.get(problem.subtopicId) ?? [];
        arr.push({
          isCorrect: a.isCorrect ?? false,
          difficultyLevel: problem.difficultyLevel ?? 5,
        });
        bySubtopic.set(problem.subtopicId, arr);
      }

      let totalXpEarned = 0;

      for (const [subtopicId, subtopicAnswers] of bySubtopic) {
        // Look up section category
        const { data: subtopicData } = await supabase
          .from("subtopics")
          .select("id, topics!inner(subject)")
          .eq("id", subtopicId)
          .limit(1)
          .single();

        if (!subtopicData) continue;

        const topic = subtopicData.topics as unknown as { subject: string };
        const sectionCategory: SectionCategory =
          topic?.subject === "math" ? "Math" : "ReadingWriting";

        let skill = await getSubsectionSkill(user.id, subtopicId);
        if (!skill) {
          await initializeAllSkills(user.id);
          skill = await getSubsectionSkill(user.id, subtopicId);
        }

        if (skill) {
          let currentSkill = skill;
          for (const answer of subtopicAnswers) {
            const mutations = updateSkillAfterAnswer(
              currentSkill,
              answer.isCorrect,
              answer.difficultyLevel
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
        }
      }

      if (totalXpEarned > 0) {
        await updateUser(clerkId, {
          totalXp: (user.totalXp ?? 0) + totalXpEarned,
        });
      }
    }
  } catch (e) {
    console.error("Failed to update subsection skills:", e);
  }

  return NextResponse.json({
    rwRawScore: rwCorrect,
    rwScaledScore: rwScaled,
    mathRawScore: mathCorrect,
    mathScaledScore: mathScaled,
    totalScore: total,
  });
}
