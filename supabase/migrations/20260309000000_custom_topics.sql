CREATE TABLE IF NOT EXISTS "custom_quiz_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"selected_option" integer NOT NULL,
	"is_correct" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE IF NOT EXISTS "custom_quiz_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"total_questions" integer NOT NULL,
	"time_elapsed_seconds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE IF NOT EXISTS "custom_topic_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"difficulty" text NOT NULL,
	"question_text" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_option" integer NOT NULL,
	"explanation" text NOT NULL,
	"solution_steps" jsonb NOT NULL,
	"hint" text NOT NULL,
	"time_recommendation_seconds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_topic_questions_topic_id_order_index_unique" UNIQUE("topic_id","order_index")
);


CREATE TABLE IF NOT EXISTS "custom_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"learning_objectives" jsonb NOT NULL,
	"tips_and_tricks" jsonb NOT NULL,
	"common_mistakes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE "custom_quiz_answers" ADD CONSTRAINT "custom_quiz_answers_session_id_custom_quiz_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."custom_quiz_sessions"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "custom_quiz_answers" ADD CONSTRAINT "custom_quiz_answers_question_id_custom_topic_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."custom_topic_questions"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "custom_quiz_sessions" ADD CONSTRAINT "custom_quiz_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "custom_quiz_sessions" ADD CONSTRAINT "custom_quiz_sessions_topic_id_custom_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."custom_topics"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "custom_topic_questions" ADD CONSTRAINT "custom_topic_questions_topic_id_custom_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."custom_topics"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "custom_topics" ADD CONSTRAINT "custom_topics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "custom_quiz_answers_session_id_idx" ON "custom_quiz_answers" USING btree ("session_id");

CREATE INDEX "custom_quiz_sessions_user_id_idx" ON "custom_quiz_sessions" USING btree ("user_id");

CREATE INDEX "custom_topic_questions_topic_id_idx" ON "custom_topic_questions" USING btree ("topic_id");

CREATE INDEX "friendships_user_id_status_idx" ON "friendships" USING btree ("user_id","status");

CREATE INDEX "learning_queue_user_id_status_idx" ON "learning_queue" USING btree ("user_id","status");

CREATE INDEX "questions_difficulty_idx" ON "questions" USING btree ("difficulty");

CREATE INDEX "quiz_attempts_user_id_idx" ON "quiz_attempts" USING btree ("user_id");

CREATE INDEX "sat_problems_subtopic_id_idx" ON "sat_problems" USING btree ("subtopic_id");

CREATE INDEX "sat_quiz_answers_session_id_idx" ON "sat_quiz_answers" USING btree ("session_id");

CREATE INDEX "sat_quiz_answers_session_id_is_correct_idx" ON "sat_quiz_answers" USING btree ("session_id","is_correct");

CREATE INDEX "sat_quiz_sessions_user_id_idx" ON "sat_quiz_sessions" USING btree ("user_id");

CREATE INDEX "sat_quiz_sessions_user_id_subtopic_id_idx" ON "sat_quiz_sessions" USING btree ("user_id","subtopic_id");

CREATE INDEX "schedules_user_id_is_active_idx" ON "schedules" USING btree ("user_id","is_active");

CREATE INDEX "sessions_user_id_scheduled_date_idx" ON "sessions" USING btree ("user_id","scheduled_date");

CREATE INDEX "sessions_user_id_status_idx" ON "sessions" USING btree ("user_id","status");

CREATE INDEX "subtopics_topic_id_idx" ON "subtopics" USING btree ("topic_id");