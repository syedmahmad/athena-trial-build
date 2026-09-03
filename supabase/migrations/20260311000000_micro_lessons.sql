CREATE TABLE IF NOT EXISTS "micro_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subtopic_id" uuid NOT NULL,
	"lesson_content" text DEFAULT '' NOT NULL,
	"whiteboard_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "micro_lessons_subtopic_id_unique" UNIQUE("subtopic_id")
);


ALTER TABLE "micro_lessons" ADD CONSTRAINT "micro_lessons_subtopic_id_subtopics_id_fk" FOREIGN KEY ("subtopic_id") REFERENCES "public"."subtopics"("id") ON DELETE cascade ON UPDATE no action;