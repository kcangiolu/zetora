CREATE TABLE "generated_file" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"chat_id" text,
	"key" text NOT NULL,
	"url" text NOT NULL,
	"filename" text NOT NULL,
	"media_type" text,
	"kind" varchar NOT NULL,
	"tool_name" text,
	"size_bytes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generated_file" ADD CONSTRAINT "generated_file_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_file" ADD CONSTRAINT "generated_file_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generatedFile_userId_idx" ON "generated_file" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "generatedFile_userId_createdAt_idx" ON "generated_file" USING btree ("user_id","created_at");