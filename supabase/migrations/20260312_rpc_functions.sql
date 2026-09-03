-- RPC functions for atomic operations
-- Run these in the Supabase SQL editor or via `supabase db push`

-- save_sat_quiz_session: atomically inserts session + answers
CREATE OR REPLACE FUNCTION save_sat_quiz_session(
  p_user_id uuid,
  p_subtopic_id uuid,
  p_score int,
  p_total_questions int,
  p_time_elapsed_seconds int,
  p_answers jsonb
) RETURNS sat_quiz_sessions AS $$
DECLARE v_session sat_quiz_sessions;
BEGIN
  INSERT INTO sat_quiz_sessions (user_id, subtopic_id, score, total_questions, time_elapsed_seconds)
  VALUES (p_user_id, p_subtopic_id, p_score, p_total_questions, p_time_elapsed_seconds)
  RETURNING * INTO v_session;

  IF jsonb_array_length(p_answers) > 0 THEN
    INSERT INTO sat_quiz_answers (session_id, problem_id, selected_option, is_correct)
    SELECT v_session.id,
           (a->>'problemId')::uuid,
           (a->>'selectedOption')::int,
           (a->>'isCorrect')::bool
    FROM jsonb_array_elements(p_answers) a;
  END IF;

  RETURN v_session;
END;
$$ LANGUAGE plpgsql;

-- save_custom_topic: atomically inserts topic + questions
CREATE OR REPLACE FUNCTION save_custom_topic(
  p_user_id uuid,
  p_title text,
  p_description text,
  p_learning_objectives jsonb,
  p_tips_and_tricks jsonb,
  p_common_mistakes jsonb,
  p_questions jsonb
) RETURNS custom_topics AS $$
DECLARE v_topic custom_topics;
BEGIN
  INSERT INTO custom_topics (user_id, title, description, learning_objectives, tips_and_tricks, common_mistakes)
  VALUES (p_user_id, p_title, p_description, p_learning_objectives, p_tips_and_tricks, p_common_mistakes)
  RETURNING * INTO v_topic;

  IF jsonb_array_length(p_questions) > 0 THEN
    INSERT INTO custom_topic_questions (topic_id, order_index, difficulty, question_text, options, correct_option, explanation, solution_steps, hint, time_recommendation_seconds)
    SELECT v_topic.id,
           (q->>'orderIndex')::int,
           q->>'difficulty',
           q->>'questionText',
           (q->'options')::jsonb,
           (q->>'correctOption')::int,
           q->>'explanation',
           (q->'solutionSteps')::jsonb,
           q->>'hint',
           (q->>'timeRecommendationSeconds')::int
    FROM jsonb_array_elements(p_questions) q;
  END IF;

  RETURN v_topic;
END;
$$ LANGUAGE plpgsql;

-- save_custom_quiz_session: atomically inserts session + answers
CREATE OR REPLACE FUNCTION save_custom_quiz_session(
  p_user_id uuid,
  p_topic_id uuid,
  p_score int,
  p_total_questions int,
  p_time_elapsed_seconds int,
  p_answers jsonb
) RETURNS custom_quiz_sessions AS $$
DECLARE v_session custom_quiz_sessions;
BEGIN
  INSERT INTO custom_quiz_sessions (user_id, topic_id, score, total_questions, time_elapsed_seconds)
  VALUES (p_user_id, p_topic_id, p_score, p_total_questions, p_time_elapsed_seconds)
  RETURNING * INTO v_session;

  IF jsonb_array_length(p_answers) > 0 THEN
    INSERT INTO custom_quiz_answers (session_id, question_id, selected_option, is_correct)
    SELECT v_session.id,
           (a->>'questionId')::uuid,
           (a->>'selectedOption')::int,
           (a->>'isCorrect')::bool
    FROM jsonb_array_elements(p_answers) a;
  END IF;

  RETURN v_session;
END;
$$ LANGUAGE plpgsql;
