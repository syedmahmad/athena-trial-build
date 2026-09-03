import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { updateUser } from "@/lib/db/queries/users";
import { completeDailyQuest } from "@/lib/db/queries/daily-quest";
import { generateQuestForDate } from "@/lib/adaptive/generate-quest";
import { supabase } from "@/lib/supabase/client";
import { NextResponse } from "next/server";

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
  const { questId, timeElapsedSeconds } = body as {
    questId: string;
    timeElapsedSeconds: number;
  };

  if (!questId || timeElapsedSeconds == null) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Aggregate results from quest problems
  const { data: problems } = await (supabase as any)
    .from("daily_quest_problems")
    .select("is_correct, difficulty_level")
    .eq("quest_id", questId)
    .not("is_correct", "is", null) as { data: { is_correct: boolean; difficulty_level: number }[] | null };

  const answered = problems ?? [];
  const correctCount = answered.filter((p) => p.is_correct).length;
  const score = correctCount;

  // Sum XP from answered problems (already applied per-answer, but record total)
  let xpTotal = 0;
  for (const p of answered) {
    if (p.is_correct) {
      const dl = p.difficulty_level;
      if (dl >= 9) xpTotal += 40;
      else if (dl >= 7) xpTotal += 20;
      else if (dl >= 4) xpTotal += 10;
      else xpTotal += 5;
    }
  }

  const quest = await completeDailyQuest(questId, {
    score,
    correctCount,
    xpEarned: xpTotal,
    timeElapsedSeconds,
  });

  // Recompute section scores from all historical data
  const { data: rwAnswers } = await (supabase as any)
    .from("quiz_answers")
    .select("is_correct, quiz_sessions!inner(user_id, subtopic_id, subtopics!inner(topics!inner(subject)))")
    .eq("quiz_sessions.user_id", user.id)
    .eq("quiz_sessions.source", "sat") as { data: any[] | null };

  // Also include daily quest answers
  const { data: dqProblems } = await (supabase as any)
    .from("daily_quest_problems")
    .select("is_correct, subtopics!inner(topics!inner(subject)), daily_quests!inner(user_id)")
    .eq("daily_quests.user_id", user.id)
    .not("is_correct", "is", null) as { data: any[] | null };

  let rwCorrect = 0, rwTotal = 0, mathCorrect = 0, mathTotal = 0;

  for (const a of rwAnswers ?? []) {
    const session = a.quiz_sessions as {
      subtopics: { topics: { subject: string } };
    };
    const subject = session?.subtopics?.topics?.subject;
    if (subject === "math") {
      mathTotal++;
      if (a.is_correct) mathCorrect++;
    } else {
      rwTotal++;
      if (a.is_correct) rwCorrect++;
    }
  }

  for (const p of dqProblems ?? []) {
    const subtopic = p.subtopics as { topics: { subject: string } };
    const subject = subtopic?.topics?.subject;
    if (subject === "math") {
      mathTotal++;
      if (p.is_correct) mathCorrect++;
    } else {
      rwTotal++;
      if (p.is_correct) rwCorrect++;
    }
  }

  const rwAccuracy = rwTotal > 0 ? rwCorrect / rwTotal : 0;
  const mathAccuracy = mathTotal > 0 ? mathCorrect / mathTotal : 0;
  const rwScore = Math.min(800, Math.round(200 + rwAccuracy * 600));
  const mathScore = Math.min(800, Math.round(200 + mathAccuracy * 600));
  const composite = rwScore + mathScore;

  const updates: Record<string, number> = {
    currentComposite: composite,
    currentReadingWriting: rwScore,
    currentMath: mathScore,
  };

  // Set start_composite on first quest ever
  if (user.startComposite == null) {
    updates.startComposite = composite;
  }

  await updateUser(clerkId, updates);

  // Pre-generate tomorrow's quest (non-blocking)
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.toISOString().split("T")[0];
    await generateQuestForDate(user.id, tomorrowDate, composite);
  } catch (e) {
    // Don't fail the completion if pre-generation fails
    console.error("Failed to pre-generate tomorrow's quest:", e);
  }

  return NextResponse.json({
    quest,
    scores: {
      readingWriting: rwScore,
      math: mathScore,
      composite,
    },
  });
}
