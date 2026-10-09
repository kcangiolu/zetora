CREATE TABLE "memory_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"text" text NOT NULL,
	"category" text NOT NULL,
	"durability" text NOT NULL,
	"tier" text NOT NULL,
	"status" text NOT NULL,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"sensitive" boolean DEFAULT false NOT NULL,
	"user_locked" boolean DEFAULT false NOT NULL,
	"source_chat_id" text,
	"last_used_at" timestamp,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_bio" (
	"user_id" text PRIMARY KEY NOT NULL,
	"user_text" text DEFAULT '' NOT NULL,
	"auto_text" text DEFAULT '' NOT NULL,
	"auto_edited_by_user_at" timestamp,
	"auto_generated_at" timestamp,
	"consolidated_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_entry" ADD CONSTRAINT "memory_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entry" ADD CONSTRAINT "memory_entry_source_chat_id_chat_id_fk" FOREIGN KEY ("source_chat_id") REFERENCES "public"."chat"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bio" ADD CONSTRAINT "user_bio_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memoryEntry_userId_status_idx" ON "memory_entry" USING btree ("user_id","status");--> statement-breakpoint
-- Graphiti and Supermemory memory were removed: drop their now-dead settings,
-- including the encrypted Graphiti LLM API key.
UPDATE "user_preferences"
SET "preferences" = ("preferences"::jsonb - ARRAY[
  'zetora-memory-provider',
  'zetora-graphiti-llm-model',
  'zetora-graphiti-llm-base-url',
  'zetora-graphiti-llm-api-key',
  'zetora-graphiti-active-provider',
  'zetora-graphiti-small-llm-provider',
  'zetora-graphiti-small-llm-model',
  'zetora-graphiti-embedding-provider',
  'zetora-graphiti-embedding-model'
])::json
WHERE "preferences"::jsonb ?| ARRAY[
  'zetora-memory-provider',
  'zetora-graphiti-llm-model',
  'zetora-graphiti-llm-base-url',
  'zetora-graphiti-llm-api-key',
  'zetora-graphiti-active-provider',
  'zetora-graphiti-small-llm-provider',
  'zetora-graphiti-small-llm-model',
  'zetora-graphiti-embedding-provider',
  'zetora-graphiti-embedding-model'
];
