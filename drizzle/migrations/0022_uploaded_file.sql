CREATE TABLE "uploaded_file" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"chat_id" text,
	"key" text NOT NULL,
	"url" text NOT NULL,
	"filename" text NOT NULL,
	"media_type" text,
	"size_bytes" integer,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "uploaded_file" ADD CONSTRAINT "uploaded_file_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_file" ADD CONSTRAINT "uploaded_file_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uploadedFile_key_idx" ON "uploaded_file" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "uploadedFile_url_idx" ON "uploaded_file" USING btree ("url");--> statement-breakpoint
CREATE INDEX "uploadedFile_userId_createdAt_id_idx" ON "uploaded_file" USING btree ("user_id","created_at","id");