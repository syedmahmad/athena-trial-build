import {
  getAllSubsectionSkills,
  initializeAllSkills,
} from "@/lib/db/queries/subsection-skills";
import { createDailyQuest } from "@/lib/db/queries/daily-quest";
import {
  computeGlobalFloor,
  composeDailyQuestBuckets,
  distributeQuestQuestions,
} from "@/lib/adaptive/engine";
import { supabase } from "@/lib/supabase/client";
import type { SubsectionSkill } from "@/types/adaptive";

/**
 * Generates a daily quest for a user on a given date.
 * Uses subsection skills + recent quest history to adaptively select problems.
 * Returns the created quest or null if one already exists for that date.
 */
export async function generateQuestForDate(
  userId: string,
  questDate: string,
  currentComposite: number | null
) {
  // Check if quest already exists for this date
  const { data: existing } = await (supabase as any)
    .from("daily_quests")
    .select("id")
    .eq("user_id", userId)
    .eq("quest_date", questDate)
    .limit(1)
    .maybeSingle();

  if (existing) return null; // Already exists

  // Get or initialize subsection skills
  let skills = await getAllSubsectionSkills(userId);
  if (skills.length === 0) {
    skills = await initializeAllSkills(userId);
  }
  if (skills.length === 0) return null;

  // Fetch recent quest performance (last 5 quests) to boost weak subtopics
  const recentPerformance = await getRecentQuestPerformance(userId);

  // Adjust skills based on recent quest performance
  const adjustedSkills = applyRecentPerformanceWeights(skills, recentPerformance);

  // Compute global floor from composite
  const composite = currentComposite ?? 800;
  const globalFloor = computeGlobalFloor(composite);

  // Get bucket assignments and question distribution
  const buckets = composeDailyQuestBuckets(adjustedSkills, globalFloor);
  const distribution = distributeQuestQuestions(buckets, 20);

  // Fetch recently answered problem IDs to avoid repeats (last 200)
  const { data: recentAnswers } = await (supabase as any)
    .from("daily_quest_problems")
    .select("problem_id, daily_quests!inner(user_id)")
    .eq("daily_quests.user_id", userId)
    .not("is_correct", "is", null)
    .limit(200);

  const recentProblemIds = new Set(
    (recentAnswers ?? []).map((r: any) => r.problem_id as string)
  );

  // Also exclude problems from quiz_answers (per-subtopic quizzes)
  const { data: quizAnswers } = await (supabase as any)
    .from("quiz_answers")
    .select("problem_id, quiz_sessions!inner(user_id)")
    .eq("quiz_sessions.user_id", userId)
    .limit(200);

  for (const a of quizAnswers ?? []) {
    recentProblemIds.add((a as any).problem_id);
  }

  // Select problems for each bucket assignment
  const selectedProblems: {
    problemId: string;
    subtopicId: string;
    orderIndex: number;
    bucket: "weak" | "mid" | "stretch";
    difficultyLevel: number;
  }[] = [];

  let orderIndex = 0;

  for (const entry of distribution) {
    if (entry.questionCount === 0) continue;

    // Find problems at target difficulty ±1
    const minDiff = Math.max(1, entry.targetDifficulty - 1);
    const maxDiff = Math.min(10, entry.targetDifficulty + 1);

    const { data: candidates } = await (supabase as any)
      .from("problems")
      .select("id, difficulty_level")
      .eq("source", "sat")
      .eq("subtopic_id", entry.subtopicId)
      .gte("difficulty_level", minDiff)
      .lte("difficulty_level", maxDiff)
      .order("order_index", { ascending: true }) as {
      data: { id: string; difficulty_level: number }[] | null;
    };

    // Filter out recently seen, prefer exact match, then nearby
    const available = (candidates ?? []).filter(
      (c) => !recentProblemIds.has(c.id)
    );

    // Sort by closeness to target difficulty
    available.sort(
      (a, b) =>
        Math.abs(a.difficulty_level - entry.targetDifficulty) -
        Math.abs(b.difficulty_level - entry.targetDifficulty)
    );

    // If not enough after filtering, include recent ones too
    let pool = available;
    if (pool.length < entry.questionCount) {
      const fallback = (candidates ?? []).filter(
        (c) => !pool.some((p) => p.id === c.id)
      );
      pool = [...pool, ...fallback];
    }

    const picked = pool.slice(0, entry.questionCount);

    for (const problem of picked) {
      selectedProblems.push({
        problemId: problem.id,
        subtopicId: entry.subtopicId,
        orderIndex,
        bucket: entry.bucket,
        difficultyLevel: problem.difficulty_level,
      });
      recentProblemIds.add(problem.id);
      orderIndex++;
    }
  }

  if (selectedProblems.length === 0) return null;

  // Override the date in createDailyQuest
  return createDailyQuestForDate(userId, questDate, selectedProblems);
}

// --- Recent quest performance ---

type SubtopicPerformance = {
  subtopicId: string;
  totalAnswered: number;
  correctCount: number;
  accuracy: number;
};

async function getRecentQuestPerformance(
  userId: string
): Promise<SubtopicPerformance[]> {
  // Get last 5 completed quests
  const { data: recentQuests } = await (supabase as any)
    .from("daily_quests")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("quest_date", { ascending: false })
    .limit(5);

  if (!recentQuests || recentQuests.length === 0) return [];

  const questIds = recentQuests.map((q: any) => q.id as string);

  // Get all answers from those quests grouped by subtopic
  const { data: answers } = await (supabase as any)
    .from("daily_quest_problems")
    .select("subtopic_id, is_correct")
    .in("quest_id", questIds)
    .not("is_correct", "is", null);

  if (!answers || answers.length === 0) return [];

  // Group by subtopic
  const grouped = new Map<string, { total: number; correct: number }>();
  for (const a of answers as any[]) {
    const key = a.subtopic_id as string;
    const entry = grouped.get(key) ?? { total: 0, correct: 0 };
    entry.total++;
    if (a.is_correct) entry.correct++;
    grouped.set(key, entry);
  }

  return Array.from(grouped.entries()).map(([subtopicId, { total, correct }]) => ({
    subtopicId,
    totalAnswered: total,
    correctCount: correct,
    accuracy: total > 0 ? correct / total : 0,
  }));
}

/**
 * Adjusts subsection skills to weight struggling subtopics lower (so they sort
 * toward the "weak" end of the bucket assignment). Subtopics with low recent
 * quest accuracy get their effective level reduced for sorting purposes.
 */
function applyRecentPerformanceWeights(
  skills: SubsectionSkill[],
  recentPerformance: SubtopicPerformance[]
): SubsectionSkill[] {
  if (recentPerformance.length === 0) return skills;

  const perfMap = new Map(recentPerformance.map((p) => [p.subtopicId, p]));

  return skills.map((skill) => {
    const perf = perfMap.get(skill.subtopicId);
    if (!perf || perf.totalAnswered < 2) return skill;

    // Low accuracy in recent quests -> reduce effective level so it gets prioritized
    // as "weak". High accuracy -> slight boost so it moves toward "mid"/"stretch".
    let levelAdjust = 0;
    if (perf.accuracy < 0.4) {
      levelAdjust = -2; // Struggling hard -> push to weak
    } else if (perf.accuracy < 0.6) {
      levelAdjust = -1; // Below average -> nudge toward weak
    } else if (perf.accuracy >= 0.9 && perf.totalAnswered >= 3) {
      levelAdjust = 1; // Mastering -> push toward stretch
    }

    const adjustedLevel = Math.max(1, Math.min(10, skill.level + levelAdjust));
    return { ...skill, level: adjustedLevel };
  });
}

// --- Quest creation with explicit date ---

async function createDailyQuestForDate(
  userId: string,
  questDate: string,
  problems: {
    problemId: string;
    subtopicId: string;
    orderIndex: number;
    bucket: "weak" | "mid" | "stretch";
    difficultyLevel: number;
  }[]
) {
  const { data: quest, error: questError } = await (supabase as any)
    .from("daily_quests")
    .insert({
      user_id: userId,
      quest_date: questDate,
      total_questions: problems.length,
    })
    .select()
    .single();

  if (questError || !quest) {
    throw new Error(questError?.message ?? "Failed to create daily quest");
  }

  const problemRows = problems.map((p) => ({
    quest_id: quest.id,
    problem_id: p.problemId,
    subtopic_id: p.subtopicId,
    order_index: p.orderIndex,
    bucket: p.bucket,
    difficulty_level: p.difficultyLevel,
  }));

  const { error: problemsError } = await (supabase as any)
    .from("daily_quest_problems")
    .insert(problemRows);

  if (problemsError) throw new Error(problemsError.message);

  return quest;
}
