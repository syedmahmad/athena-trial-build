import { supabase } from "@/lib/supabase/client";
import type {
  QuizAggregates,
  QuizEventDensity,
  QuizPerQuestion,
} from "./types";

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

type SubtopicRow = {
  id: string;
  name: string;
  topics: { name: string } | null;
};

export async function fetchQuizAggregates(
  sessionId: string,
  userId: string
): Promise<QuizAggregates | null> {
  const { data: session } = await supabase
    .from("quiz_sessions")
    .select("id, user_id, source, subtopic_id, custom_topic_id, score, total_questions, time_elapsed_seconds, created_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!session) return null;

  const [{ data: answers }, { data: events }] = await Promise.all([
    supabase
      .from("quiz_answers")
      .select("problem_id, selected_option, is_correct, difficulty_level, response_time_ms, wrong_count, hint_used, tutor_used, practice_completed")
      .eq("session_id", sessionId)
      .order("id", { ascending: true }),
    (supabase as unknown as {
      from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => { order: (k: string, o: { ascending: boolean }) => Promise<{ data: Array<{ event_type: string; response_time_ms: number | null; selected_option: number | null; wrong_count: number | null }> | null }> } } };
    })
      .from("quiz_question_events")
      .select("event_type, response_time_ms, selected_option, wrong_count")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
  ]);

  let topicName = "";
  let subtopicName = "";
  if (session.subtopic_id) {
    const { data: subtopic } = await supabase
      .from("subtopics")
      .select("id, name, topics!inner(name)")
      .eq("id", session.subtopic_id)
      .maybeSingle();
    if (subtopic) {
      const row = subtopic as unknown as SubtopicRow;
      subtopicName = row.name;
      topicName = row.topics?.name ?? "";
    }
  } else if (session.custom_topic_id) {
    const { data: custom } = await supabase
      .from("custom_topics")
      .select("name")
      .eq("id", session.custom_topic_id)
      .maybeSingle();
    subtopicName = (custom as { name?: string } | null)?.name ?? "Custom Topic";
    topicName = "My Learning";
  }

  const perQuestion: QuizPerQuestion[] = (answers ?? []).map((a, i) => ({
    index: i,
    problemId: a.problem_id,
    isCorrect: !!a.is_correct,
    responseTimeMs: a.response_time_ms ?? null,
    wrongCount: a.wrong_count ?? 0,
    hintUsed: !!a.hint_used,
    tutorUsed: !!a.tutor_used,
    practiceCompleted: !!a.practice_completed,
    difficultyLevel: a.difficulty_level ?? 5,
  }));

  const timings = perQuestion
    .map((q) => q.responseTimeMs)
    .filter((v): v is number => typeof v === "number" && v > 0);

  const meanMs = mean(timings);
  const medianMs = median(timings);
  const tutorCount = perQuestion.filter((q) => q.tutorUsed).length;
  const practiceCompletedCount = perQuestion.filter((q) => q.practiceCompleted).length;
  const recoveryRate = tutorCount > 0 ? practiceCompletedCount / tutorCount : 0;

  // `quiz_sessions.time_elapsed_seconds` pauses on the /tutor sub-route
  // (see quiz-layout-provider.tsx), so a session that spent most of its
  // wall-clock in tutor mode reports a wildly low number — a 40-question
  // session legitimately showing "36s" in the first generated PDF. Sum
  // of per-question response_time_ms is the truer active-attention
  // measure, since it starts at first-display and ends at the answer
  // event. Take whichever is larger so we don't UNDERcount when timer
  // was paused, while preserving short sessions where session timer
  // was right all along.
  const sumResponseSec = Math.round(timings.reduce((a, b) => a + b, 0) / 1000);
  const effectiveTimeElapsed = Math.max(
    session.time_elapsed_seconds,
    sumResponseSec
  );

  const eventDensity: QuizEventDensity = {
    answerWrong: 0,
    hintShown: 0,
    tutorEntered: 0,
    tutorCorrect: 0,
    practiceStarted: 0,
    practiceCorrect: 0,
    practiceExhausted: 0,
  };
  for (const e of events ?? []) {
    switch (e.event_type) {
      case "answer_wrong": eventDensity.answerWrong++; break;
      case "hint_shown": eventDensity.hintShown++; break;
      case "tutor_entered": eventDensity.tutorEntered++; break;
      case "tutor_correct": eventDensity.tutorCorrect++; break;
      case "practice_started": eventDensity.practiceStarted++; break;
      case "practice_correct": eventDensity.practiceCorrect++; break;
      case "practice_exhausted": eventDensity.practiceExhausted++; break;
    }
  }

  let skill: QuizAggregates["skill"] = null;
  if (session.subtopic_id) {
    const { data: skillRow } = await supabase
      .from("subsection_skills")
      .select("level, xp, streak_correct, streak_wrong")
      .eq("user_id", userId)
      .eq("subtopic_id", session.subtopic_id)
      .maybeSingle();
    if (skillRow) {
      skill = {
        level: skillRow.level,
        xp: skillRow.xp,
        streakCorrect: skillRow.streak_correct,
        streakWrong: skillRow.streak_wrong,
      };
    }
  }

  return {
    sessionId: session.id,
    topicName,
    subtopicName,
    score: session.score,
    totalQuestions: session.total_questions,
    timeElapsedSeconds: effectiveTimeElapsed,
    createdAt: session.created_at,
    accuracy: session.total_questions > 0 ? session.score / session.total_questions : 0,
    meanResponseTimeMs: meanMs,
    medianResponseTimeMs: medianMs,
    hintRate: perQuestion.length > 0 ? perQuestion.filter((q) => q.hintUsed).length / perQuestion.length : 0,
    tutorRate: perQuestion.length > 0 ? tutorCount / perQuestion.length : 0,
    recoveryRate,
    perQuestion,
    events: eventDensity,
    skill,
  };
}
