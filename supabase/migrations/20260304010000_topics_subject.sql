ALTER TABLE "topics" DROP CONSTRAINT "topics_order_index_unique";

ALTER TABLE "topics" ADD COLUMN "subject" text DEFAULT 'math' NOT NULL;

ALTER TABLE "topics" ADD CONSTRAINT "topics_subject_order_index" UNIQUE("subject","order_index");