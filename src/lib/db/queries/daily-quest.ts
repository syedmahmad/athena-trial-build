import { supabase } from "@/lib/supabase/client";
import type {
  DailyQuest,
  DailyQuestProblem,
  DailyQuestProblemWithDetails,
  QuestBucket,
} from "@/types/adaptive";

function mapQuest(row: Record<string, unknown>): DailyQuest {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    questDate: row.quest_date as string,
    status: row.status as DailyQuest["status"],
    score: row.score as number,
    totalQuestions: row.total_questions as number,
    correctCount: row.correct_count as number,
    xpEarned: row.xp_earned as number,
    timeElapsedSeconds: row.time_elapsed_seconds as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapQuestProblem(row: Record<string, unknown>): DailyQuestProblem {
  return {
    id: row.id as string,
    questId: row.quest_id as string,
    problemId: row.problem_id as string,
    subtopicId: row.subtopic_id as string,
    orderIndex: row.order_index as number,
    bucket: row.bucket as QuestBucket,
    difficultyLevel: row.difficulty_level as number,
    selectedOption: row.selected_option as number | null,
    isCorrect: row.is_correct as boolean | null,
    responseTimeMs: row.response_time_ms as number | null,
    answeredAt: row.answered_at as string | null,
  };
}

export async function getTodaysQuest(
  userId: string
): Promise<{ quest: DailyQuest; problems: DailyQuestProblem[] } | null> {
  const today = new Date().toISOString().split("T")[0];

  const { data: quest } = await (supabase as any)
    .from("daily_quests")
    .select("*")
    .eq("user_id", userId)
    .eq("quest_date", today)
    .limit(1)
    .single();

  if (!quest) return null;

  const { data: problems } = await (supabase as any)
    .from("daily_quest_problems")
    .select("*")
    .eq("quest_id", quest.id)
    .order("order_index", { ascending: true });

  return {
    quest: mapQuest(quest),
    problems: (problems ?? []).map(mapQuestProblem),
  };
}

export async function getTodaysQuestWithDetails(
  userId: string
): Promise<{
  quest: DailyQuest;
  problems: DailyQuestProblemWithDetails[];
} | null> {
  const today = new Date().toISOString().split("T")[0];

  const { data: quest } = await (supabase as any)
    .from("daily_quests")
    .select("*")
    .eq("user_id", userId)
    .eq("quest_date", today)
    .limit(1)
    .single();

  if (!quest) return null;

  const { data: problems } = await (supabase as any)
    .from("daily_quest_problems")
    .select(
      `*, problems!inner(question_text, options, correct_option, explanation, solution_steps, hint, detailed_hint), subtopics!inner(name, topics!inner(name))`
    )
    .eq("quest_id", quest.id)
    .order("order_index", { ascending: true });

  const mapped: DailyQuestProblemWithDetails[] = (problems ?? []).map(
    (row: any) => {
      const problem = row.problems as Record<string, unknown>;
      const subtopic = row.subtopics as Record<string, unknown>;
      const topic = (subtopic?.topics ?? {}) as Record<string, unknown>;

      return {
        ...mapQuestProblem(row),
        questionText: problem.question_text as string,
        options: problem.options as { id: number; text: string }[],
        correctOption: problem.correct_option as number,
        explanation: problem.explanation as string,
        solutionSteps: (problem.solution_steps ?? []) as {
          step: number;
          instruction: string;
          math?: string;
        }[],
        hint: (problem.hint ?? "") as string,
        detailedHint: (problem.detailed_hint ?? "") as string,
        subtopicName: subtopic.name as string,
        topicName: topic.name as string,
      };
    }
  );

  return { quest: mapQuest(quest), problems: mapped };
}

export async function createDailyQuest(
  userId: string,
  problems: {
    problemId: string;
    subtopicId: string;
    orderIndex: number;
    bucket: QuestBucket;
    difficultyLevel: number;
  }[]
): Promise<{ quest: DailyQuest; problems: DailyQuestProblem[] }> {
  const today = new Date().toISOString().split("T")[0];

  const { data: quest, error: questError } = await (supabase as any)
    .from("daily_quests")
    .insert({
      user_id: userId,
      quest_date: today,
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

  const { data: insertedProblems, error: problemsError } = await (supabase as any)
    .from("daily_quest_problems")
    .insert(problemRows)
    .select();

  if (problemsError) throw new Error(problemsError.message);

  return {
    quest: mapQuest(quest),
    problems: (insertedProblems ?? []).map(mapQuestProblem),
  };
}

export async function answerDailyQuestProblem(
  questProblemId: string,
  selectedOption: number,
  isCorrect: boolean,
  responseTimeMs: number
): Promise<DailyQuestProblem> {
  const { data, error } = await (supabase as any)
    .from("daily_quest_problems")
    .update({
      selected_option: selectedOption,
      is_correct: isCorrect,
      response_time_ms: responseTimeMs,
      answered_at: new Date().toISOString(),
    })
    .eq("id", questProblemId)
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to record answer");
  return mapQuestProblem(data);
}

export async function completeDailyQuest(
  questId: string,
  stats: {
    score: number;
    correctCount: number;
    xpEarned: number;
    timeElapsedSeconds: number;
  }
): Promise<DailyQuest> {
  const { data, error } = await (supabase as any)
    .from("daily_quests")
    .update({
      status: "completed",
      score: stats.score,
      correct_count: stats.correctCount,
      xp_earned: stats.xpEarned,
      time_elapsed_seconds: stats.timeElapsedSeconds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", questId)
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to complete quest");
  return mapQuest(data);
}

export async function updateQuestStatus(
  questId: string,
  status: "in_progress" | "completed"
): Promise<void> {
  const { error } = await (supabase as any)
    .from("daily_quests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", questId);

  if (error) throw new Error(error.message);
}

export async function getQuestHistory(
  userId: string,
  limit: number = 10
): Promise<DailyQuest[]> {
  const { data } = await (supabase as any)
    .from("daily_quests")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("quest_date", { ascending: false })
    .limit(limit);

  return (data ?? []).map(mapQuest);
}
