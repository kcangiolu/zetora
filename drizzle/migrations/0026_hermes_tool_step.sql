CREATE TABLE "hermes_tool_step" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"tool_call_id" text NOT NULL,
	"trigger_message_id" text,
	"tool_name" text NOT NULL,
	"preview" text,
	"status" text NOT NULL,
	"duration_ms" integer,
	"started_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hermes_tool_step" ADD CONSTRAINT "hermes_tool_step_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hermes_tool_step" ADD CONSTRAINT "hermes_tool_step_trigger_message_id_message_id_fk" FOREIGN KEY ("trigger_message_id") REFERENCES "public"."message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hermesToolStep_chatId_toolCallId_idx" ON "hermes_tool_step" USING btree ("chat_id","tool_call_id");