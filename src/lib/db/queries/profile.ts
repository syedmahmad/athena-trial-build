import { supabase } from "@/lib/supabase/client";

export async function getProfileData(userId: string) {
  const [
    userRes,
    sessionsRes,
    quizSessionsRes,
  ] = await Promise.all([
    supabase
      .from("users")
      .select("display_name, avatar_url, created_at, target_score, best_streak")
      .eq("id", userId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("sessions")
      .select("scheduled_date, status")
      .eq("user_id", userId)
      .order("scheduled_date", { ascending: false })
      .limit(30),
    supabase
      .from("quiz_sessions")
      .select("id, score, total_questions, time_elapsed_seconds")
      .eq("user_id", userId)
      .eq("source", "sat"),
  ]);

  const userRecord = userRes.data;
  const sessionHistory = sessionsRes.data ?? [];
  const quizSessions = quizSessionsRes.data ?? [];

  // Fetch answers for all quiz sessions
  const sessionIds = quizSessions.map((s) => s.id);
  let totalAnswers = 0;
  let correctAnswers = 0;

  if (sessionIds.length > 0) {
    const { data: answers } = await supabase
      .from("quiz_answers")
      .select("is_correct")
      .in("session_id", sessionIds);

    totalAnswers = answers?.length ?? 0;
    correctAnswers = answers?.filter((a) => a.is_correct).length ?? 0;
  }

  // Calculate current streak
  let streak = 0;
  const completedHistory = sessionHistory
    .filter((s) => s.status === "completed")
    .sort(
      (a, b) =>
        new Date(b.scheduled_date).getTime() -
        new Date(a.scheduled_date).getTime()
    );

  if (completedHistory.length > 0) {
    streak = 1;
    for (let i = 1; i < completedHistory.length; i++) {
      const curr = new Date(completedHistory[i].scheduled_date);
      const prev = new Date(completedHistory[i - 1].scheduled_date);
      const diffDays =
        (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays <= 7) {
        streak++;
      } else {
        break;
      }
    }
  }

  const totalScore = quizSessions.reduce((sum, s) => sum + s.score, 0);
  const totalTimeSeconds = quizSessions.reduce(
    (sum, s) => sum + s.time_elapsed_seconds,
    0
  );
  const accuracy =
    totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0;

  return {
    user: userRecord
      ? {
          displayName: userRecord.display_name,
          avatarUrl: userRecord.avatar_url,
          createdAt: new Date(userRecord.created_at),
          targetScore: userRecord.target_score,
          bestStreak: userRecord.best_streak,
        }
      : null,
    totalScore,
    questsDone: quizSessions.length,
    totalTimeSeconds,
    accuracy,
    streak,
    bestStreak: userRecord?.best_streak ?? 0,
  };
}
