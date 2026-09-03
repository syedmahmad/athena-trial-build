CREATE TABLE IF NOT EXISTS "practice_problems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subtopic_id" uuid,
	"topic_slug" text NOT NULL,
	"subtopic_slug" text NOT NULL,
	"order_index" integer NOT NULL,
	"difficulty" text NOT NULL,
	"question_text" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_option" integer NOT NULL,
	"explanation" text NOT NULL,
	"solution_steps" jsonb NOT NULL,
	"concept_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"common_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"time_recommendation_seconds" integer NOT NULL,
	"sat_frequency" text,
	"hint" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);


CREATE INDEX "practice_problems_topic_subtopic_idx" ON "practice_problems" USING btree ("topic_slug","subtopic_slug");