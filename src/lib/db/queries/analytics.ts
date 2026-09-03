import { supabase } from "@/lib/supabase/client";

export type StuckPoint = {
  subtopicId: string;
  subtopicName: string;
  subtopicSlug: string;
  topicName: string;
  topicSlug: string;
  stuckScore: number;
  metrics: {
    accuracy: number;
    wrongRate: number;
    hintRate: number;
    tutorRate: number;
    avgResponseTimeMs: number;
    totalAttempts: number;
    recentTrend: number;
    microLessonCompleted: boolean;
  };
  recommendation: "micro-lesson" | "practice" | "review-quiz";
};

export type EngagementSummary = {
  totalQuizTimeSeconds: number;
  totalLessonTimeSeconds: number;
  microLessonCompletionRate: number;
  avgHintsPerQuestion: number;
  avgTutorEntriesPerSession: number;
  fullScaffoldingCount: number;
  improvementTrend: "improving" | "stable" | "declining";
};

export async function getStuckPoints(userId: string): Promise<StuckPoint[]> {
  // 1. Get subsection skills
  const { data: skills } = await supabase
    .from("subsection_skills")
    .select("subtopic_id, level, total_attempts, correct_attempts, last_10")
    .eq("user_id", userId);

  if (!skills || skills.length === 0) return [];

  const skillMap = new Map(
    skills.map((s) => [s.subtopic_id, s])
  );

  // 2. Get recent quiz answers with tracking columns (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: sessions } = await supabase
    .from("quiz_sessions")
    .select("id, subtopic_id")
    .eq("user_id", userId)
    .eq("source", "sat")
    .gte("created_at", thirtyDaysAgo);

  if (!sessions || sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);
  const sessionSubtopicMap = new Map(sessions.map((s) => [s.id, s.subtopic_id]));

  const { data: answers } = await (supabase as any)
    .from("quiz_answers")
    .select("session_id, is_correct, wrong_count, hint_used, tutor_used, practice_completed, response_time_ms")
    .in("session_id", sessionIds) as { data: {
      session_id: string;
      is_correct: boolean;
      wrong_count: number | null;
      hint_used: boolean | null;
      tutor_used: boolean | null;
      practice_completed: boolean | null;
      response_time_ms: number | null;
    }[] | null };

  if (!answers || answers.length === 0) return [];

  // 3. Group answers by subtopic
  type SubtopicStats = {
    total: number;
    correct: number;
    withWrong: number;
    withHint: number;
    withTutor: number;
    responseTimes: number[];
  };

  const statsMap = new Map<string, SubtopicStats>();

  for (const a of answers) {
    const subtopicId = sessionSubtopicMap.get(a.session_id);
    if (!subtopicId) continue;

    if (!statsMap.has(subtopicId)) {
      statsMap.set(subtopicId, { total: 0, correct: 0, withWrong: 0, withHint: 0, withTutor: 0, responseTimes: [] });
    }
    const s = statsMap.get(subtopicId)!;
    s.total++;
    if (a.is_correct) s.correct++;
    if (a.wrong_count && a.wrong_count > 0) s.withWrong++;
    if (a.hint_used) s.withHint++;
    if (a.tutor_used) s.withTutor++;
    if (a.response_time_ms) s.responseTimes.push(a.response_time_ms);
  }

  // 4. Get micro-lesson completion status
  const subtopicIds = [...statsMap.keys()];
  const { data: lessonSessions } = await (supabase as any)
    .from("micro_lesson_sessions")
    .select("subtopic_id, completed")
    .eq("user_id", userId)
    .in("subtopic_id", subtopicIds) as { data: { subtopic_id: string; completed: boolean }[] | null };

  const completedLessons = new Set(
    (lessonSessions ?? []).filter((s) => s.completed).map((s) => s.subtopic_id)
  );

  // 5. Get subtopic/topic names
  const { data: subtopics } = await supabase
    .from("subtopics")
    .select("id, name, slug, topics!inner(name, slug)")
    .in("id", subtopicIds);

  const subtopicInfo = new Map(
    (subtopics ?? []).map((st) => {
      const topic = st.topics as unknown as { name: string; slug: string };
      return [st.id, { name: st.name, slug: st.slug, topicName: topic.name, topicSlug: topic.slug }];
    })
  );

  // 6. Compute stuck scores
  const results: StuckPoint[] = [];

  for (const [subtopicId, stats] of statsMap) {
    const skill = skillMap.get(subtopicId);
    const info = subtopicInfo.get(subtopicId);
    if (!info) continue;

    const accuracy = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
    const wrongRate = stats.total > 0 ? (stats.withWrong / stats.total) * 100 : 0;
    const hintRate = stats.total > 0 ? (stats.withHint / stats.total) * 100 : 0;
    const tutorRate = stats.total > 0 ? (stats.withTutor / stats.total) * 100 : 0;
    const avgResponseTimeMs = stats.responseTimes.length > 0
      ? stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length
      : 0;

    // Recent trend: count wrongs in last 10 attempts
    const last10 = skill?.last_10 as boolean[] | null;
    const recentTrend = last10 ? last10.filter((v) => !v).length : 0;

    const microLessonCompleted = completedLessons.has(subtopicId);

    // Stuck score: higher = more stuck
    const stuckScore =
      (wrongRate / 100) * 3 +
      (tutorRate / 100) * 4 +
      ((100 - accuracy) / 100) * 2 +
      (recentTrend / 10);

    let recommendation: StuckPoint["recommendation"] = "practice";
    if (!microLessonCompleted) recommendation = "micro-lesson";
    else if (accuracy < 50) recommendation = "review-quiz";

    results.push({
      subtopicId,
      subtopicName: info.name,
      subtopicSlug: info.slug,
      topicName: info.topicName,
      topicSlug: info.topicSlug,
      stuckScore,
      metrics: {
        accuracy: Math.round(accuracy),
        wrongRate: Math.round(wrongRate),
        hintRate: Math.round(hintRate),
        tutorRate: Math.round(tutorRate),
        avgResponseTimeMs: Math.round(avgResponseTimeMs),
        totalAttempts: stats.total,
        recentTrend,
        microLessonCompleted,
      },
      recommendation,
    });
  }

  // Sort by stuck score descending
  results.sort((a, b) => b.stuckScore - a.stuckScore);
  return results;
}

export async function getEngagementSummary(userId: string): Promise<EngagementSummary> {
  // Quiz time
  const { data: quizSessions } = await supabase
    .from("quiz_sessions")
    .select("time_elapsed_seconds")
    .eq("user_id", userId);

  const totalQuizTimeSeconds = (quizSessions ?? []).reduce(
    (sum, s) => sum + (s.time_elapsed_seconds ?? 0),
    0
  );

  // Lesson time
  const { data: lessonSessions } = await (supabase as any)
    .from("micro_lesson_sessions")
    .select("duration_seconds, completed")
    .eq("user_id", userId) as { data: { duration_seconds: number; completed: boolean }[] | null };

  const totalLessonTimeSeconds = (lessonSessions ?? []).reduce(
    (sum, s) => sum + (s.duration_seconds ?? 0),
    0
  );

  const totalLessons = (lessonSessions ?? []).length;
  const completedLessons = (lessonSessions ?? []).filter((s) => s.completed).length;
  const microLessonCompletionRate = totalLessons > 0
    ? Math.round((completedLessons / totalLessons) * 100)
    : 0;

  // Hint and tutor usage from quiz_answers
  const { data: answers } = await (supabase as any)
    .from("quiz_answers")
    .select("hint_used, tutor_used, practice_completed, session_id")
    .eq("user_id", userId) as { data: { hint_used: boolean | null; tutor_used: boolean | null; practice_completed: boolean | null; session_id: string }[] | null };

  // quiz_answers doesn't have user_id directly, so we need to go through sessions
  const { data: userSessions } = await supabase
    .from("quiz_sessions")
    .select("id")
    .eq("user_id", userId);

  const userSessionIds = new Set((userSessions ?? []).map((s) => s.id));

  const { data: allAnswers } = await (supabase as any)
    .from("quiz_answers")
    .select("hint_used, tutor_used, practice_completed, session_id")
    .in("session_id", [...userSessionIds]) as { data: { hint_used: boolean | null; tutor_used: boolean | null; practice_completed: boolean | null; session_id: string }[] | null };

  const totalAnswers = (allAnswers ?? []).length;
  const hintsUsed = (allAnswers ?? []).filter((a) => a.hint_used).length;
  const tutorsUsed = (allAnswers ?? []).filter((a) => a.tutor_used).length;
  const fullScaffoldingCount = (allAnswers ?? []).filter(
    (a) => a.hint_used && a.tutor_used && a.practice_completed
  ).length;

  const avgHintsPerQuestion = totalAnswers > 0
    ? Math.round((hintsUsed / totalAnswers) * 100) / 100
    : 0;

  const totalUserSessions = (userSessions ?? []).length;
  const avgTutorEntriesPerSession = totalUserSessions > 0
    ? Math.round((tutorsUsed / totalUserSessions) * 100) / 100
    : 0;

  // Improvement trend: compare accuracy of first half vs second half of sessions
  const { data: recentSessions } = await supabase
    .from("quiz_sessions")
    .select("id, score, total_questions, created_at")
    .eq("user_id", userId)
    .eq("source", "sat")
    .order("created_at", { ascending: true });

  let improvementTrend: EngagementSummary["improvementTrend"] = "stable";
  if (recentSessions && recentSessions.length >= 4) {
    const mid = Math.floor(recentSessions.length / 2);
    const firstHalf = recentSessions.slice(0, mid);
    const secondHalf = recentSessions.slice(mid);

    const avgFirst = firstHalf.reduce((s, r) => s + (r.total_questions > 0 ? r.score / r.total_questions : 0), 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, r) => s + (r.total_questions > 0 ? r.score / r.total_questions : 0), 0) / secondHalf.length;

    const delta = avgSecond - avgFirst;
    if (delta > 0.05) improvementTrend = "improving";
    else if (delta < -0.05) improvementTrend = "declining";
  }

  return {
    totalQuizTimeSeconds,
    totalLessonTimeSeconds,
    microLessonCompletionRate,
    avgHintsPerQuestion,
    avgTutorEntriesPerSession,
    fullScaffoldingCount,
    improvementTrend,
  };
}
