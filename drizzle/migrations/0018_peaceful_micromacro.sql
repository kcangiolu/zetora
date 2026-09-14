ALTER TABLE "message" ADD COLUMN "is_compaction_summary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "compaction_replaced_count" integer;