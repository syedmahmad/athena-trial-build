import { supabase } from "@/lib/supabase/client";

export async function saveCustomTopic(data: {
  userId: string;
  title: string;
  description: string;
  learningObjectives: string[];
  tipsAndTricks: string[];
  commonMistakes: { mistake: string; correction: string; why: string }[];
  questions: {
    orderIndex: number;
    difficulty: string;
    questionText: string;
    options: string[];
    correctOption: number;
    explanation: string;
    solutionSteps: { step: number; instruction: string; math: string }[];
    hint: string;
    timeRecommendationSeconds: number;
  }[];
}) {
  const { data: topic, error: topicError } = await supabase
    .from("custom_topics")
    .insert({
      user_id: data.userId,
      title: data.title,
      description: data.description,
      learning_objectives: data.learningObjectives,
      tips_and_tricks: data.tipsAndTricks,
      common_mistakes: data.commonMistakes,
    })
    .select()
    .single();

  if (topicError || !topic) throw new Error(topicError?.message ?? "Failed to save topic");

  if (data.questions.length > 0) {
    const { error: questionsError } = await supabase
      .from("problems")
      .insert(
        data.questions.map((q) => ({
          source: "custom" as const,
          custom_topic_id: topic.id,
          order_index: q.orderIndex,
          difficulty: q.difficulty,
          question_text: q.questionText,
          options: q.options,
          correct_option: q.correctOption,
          explanation: q.explanation,
          solution_steps: q.solutionSteps,
          hint: q.hint,
          time_recommendation_seconds: q.timeRecommendationSeconds,
        }))
      );
    if (questionsError) throw new Error(questionsError.message);
  }

  return {
    id: topic.id,
    userId: topic.user_id,
    title: topic.title,
    description: topic.description,
    createdAt: new Date(topic.created_at),
  };
}

export async function getCustomTopicWithQuestions(
  topicId: string,
  userId: string
) {
  const { data: topic } = await supabase
    .from("custom_topics")
    .select("*")
    .eq("id", topicId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!topic) return null;

  const { data: questionsData } = await supabase
    .from("problems")
    .select("*")
    .eq("source", "custom")
    .eq("custom_topic_id", topicId)
    .order("order_index", { ascending: true });

  const mappedTopic = {
    id: topic.id,
    userId: topic.user_id,
    title: topic.title,
    description: topic.description,
    learningObjectives: topic.learning_objectives,
    tipsAndTricks: topic.tips_and_tricks,
    commonMistakes: topic.common_mistakes,
    createdAt: new Date(topic.created_at),
  };

  const questions = (questionsData ?? []).map((q) => ({
    id: q.id,
    topicId: q.custom_topic_id,
    orderIndex: q.order_index,
    difficulty: q.difficulty,
    questionText: q.question_text,
    options: q.options,
    correctOption: q.correct_option,
    explanation: q.explanation,
    solutionSteps: q.solution_steps,
    hint: q.hint,
    timeRecommendationSeconds: q.time_recommendation_seconds,
    createdAt: new Date(q.created_at),
  }));

  return { topic: mappedTopic, questions };
}

export async function getUserCustomTopics(userId: string) {
  const { data } = await supabase
    .from("custom_topics")
    .select("id, title, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: new Date(row.created_at),
  }));
}

export async function saveCustomQuizSession(data: {
  userId: string;
  topicId: string;
  score: number;
  totalQuestions: number;
  timeElapsedSeconds: number;
  answers: { questionId: string; selectedOption: number; isCorrect: boolean }[];
}) {
  const { data: session, error: sessionError } = await supabase
    .from("quiz_sessions")
    .insert({
      user_id: data.userId,
      source: "custom",
      custom_topic_id: data.topicId,
      score: data.score,
      total_questions: data.totalQuestions,
      time_elapsed_seconds: data.timeElapsedSeconds,
    })
    .select()
    .single();

  if (sessionError || !session) throw new Error(sessionError?.message ?? "Failed to save session");

  if (data.answers.length > 0) {
    const { error: answersError } = await supabase
      .from("quiz_answers")
      .insert(
        data.answers.map((a) => ({
          session_id: session.id,
          problem_id: a.questionId,
          selected_option: a.selectedOption,
          is_correct: a.isCorrect,
        }))
      );
    if (answersError) throw new Error(answersError.message);
  }

  return {
    id: session.id,
    userId: session.user_id,
    topicId: session.custom_topic_id,
    score: session.score,
    totalQuestions: session.total_questions,
    timeElapsedSeconds: session.time_elapsed_seconds,
    createdAt: new Date(session.created_at),
  };
}
