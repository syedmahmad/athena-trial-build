CREATE TABLE IF NOT EXISTS "learning_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress_pct" integer DEFAULT 0 NOT NULL,
	"added_during" text DEFAULT 'onboarding' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_queue_user_id_lesson_id_unique" UNIQUE("user_id","lesson_id")
);


CREATE TABLE IF NOT EXISTS "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"estimated_duration_minutes" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lessons_question_id_unique" UNIQUE("question_id")
);


CREATE TABLE IF NOT EXISTS "onboarding_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"current_step" text DEFAULT 'gist' NOT NULL,
	"quiz_question_index" integer DEFAULT 0 NOT NULL,
	"lesson_preference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_progress_user_id_unique" UNIQUE("user_id")
);


CREATE TABLE IF NOT EXISTS "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_index" integer NOT NULL,
	"difficulty" text NOT NULL,
	"category" text NOT NULL,
	"question_text" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_option" integer NOT NULL,
	"explanation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questions_order_index_unique" UNIQUE("order_index")
);


CREATE TABLE IF NOT EXISTS "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"selected_option" integer NOT NULL,
	"is_correct" boolean NOT NULL,
	"time_spent_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE IF NOT EXISTS "sat_problems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subtopic_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"difficulty" text NOT NULL,
	"question_text" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_option" integer NOT NULL,
	"explanation" text NOT NULL,
	"solution_steps" jsonb NOT NULL,
	"concept_tags" jsonb NOT NULL,
	"common_errors" jsonb NOT NULL,
	"time_recommendation_seconds" integer NOT NULL,
	"sat_frequency" text NOT NULL,
	"hint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sat_problems_subtopic_id_order_index_unique" UNIQUE("subtopic_id","order_index")
);


CREATE TABLE IF NOT EXISTS "sat_quiz_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"problem_id" uuid NOT NULL,
	"selected_option" integer NOT NULL,
	"is_correct" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE IF NOT EXISTS "sat_quiz_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subtopic_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"total_questions" integer NOT NULL,
	"time_elapsed_seconds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE IF NOT EXISTS "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day_of_week" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"scheduled_date" date NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE IF NOT EXISTS "subtopics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"order_index" integer NOT NULL,
	"description" text NOT NULL,
	"learning_objectives" jsonb NOT NULL,
	"key_formulas" jsonb NOT NULL,
	"common_mistakes" jsonb NOT NULL,
	"tips_and_tricks" jsonb NOT NULL,
	"difficulty" text NOT NULL,
	"estimated_minutes" integer NOT NULL,
	"prerequisite_subtopic_slugs" jsonb NOT NULL,
	"conceptual_overview" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subtopics_topic_id_slug_unique" UNIQUE("topic_id","slug")
);


CREATE TABLE IF NOT EXISTS "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"order_index" integer NOT NULL,
	"color_scheme" text NOT NULL,
	"overview" text NOT NULL,
	"learning_objectives" jsonb NOT NULL,
	"sat_relevance" jsonb NOT NULL,
	"difficulty_distribution" jsonb NOT NULL,
	"estimated_total_minutes" integer NOT NULL,
	"prerequisites" jsonb NOT NULL,
	"key_concepts" jsonb NOT NULL,
	"pro_tips" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topics_slug_unique" UNIQUE("slug"),
	CONSTRAINT "topics_order_index_unique" UNIQUE("order_index")
);


CREATE TABLE IF NOT EXISTS "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lesson_delivery" text,
	"theme" text DEFAULT 'system',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);


CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"skill_score" integer,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);


ALTER TABLE "learning_queue" ADD CONSTRAINT "learning_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "learning_queue" ADD CONSTRAINT "learning_queue_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "lessons" ADD CONSTRAINT "lessons_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "sat_problems" ADD CONSTRAINT "sat_problems_subtopic_id_subtopics_id_fk" FOREIGN KEY ("subtopic_id") REFERENCES "public"."subtopics"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "sat_quiz_answers" ADD CONSTRAINT "sat_quiz_answers_session_id_sat_quiz_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sat_quiz_sessions"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "sat_quiz_answers" ADD CONSTRAINT "sat_quiz_answers_problem_id_sat_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."sat_problems"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "sat_quiz_sessions" ADD CONSTRAINT "sat_quiz_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "sat_quiz_sessions" ADD CONSTRAINT "sat_quiz_sessions_subtopic_id_subtopics_id_fk" FOREIGN KEY ("subtopic_id") REFERENCES "public"."subtopics"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "schedules" ADD CONSTRAINT "schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "subtopics" ADD CONSTRAINT "subtopics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;