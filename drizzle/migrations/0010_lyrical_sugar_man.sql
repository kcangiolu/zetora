CREATE TABLE "agent_mode_usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"message_id" text NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"reset_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anthropic_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"reset_at" timestamp NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "build_session" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"user_id" text NOT NULL,
	"box_id" text,
	"runtime" text DEFAULT 'node' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"snapshot_id" text,
	"total_cost_usd" real,
	"total_compute_ms" integer,
	"total_input_tokens" integer,
	"total_output_tokens" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "google_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"reset_at" timestamp NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_mcp_server" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"transport_type" varchar DEFAULT 'http' NOT NULL,
	"url" text NOT NULL,
	"auth_type" varchar DEFAULT 'none' NOT NULL,
	"encrypted_credentials" text,
	"oauth_issuer_url" text,
	"oauth_authorization_url" text,
	"oauth_token_url" text,
	"oauth_scopes" text,
	"oauth_client_id" text,
	"oauth_client_secret_encrypted" text,
	"oauth_access_token_encrypted" text,
	"oauth_refresh_token_encrypted" text,
	"oauth_access_token_expires_at" timestamp,
	"oauth_connected_at" timestamp,
	"oauth_error" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"disabled_tools" json DEFAULT '[]'::json,
	"last_tested_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "email_verified" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "is_pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lookout" ADD COLUMN "search_mode" text DEFAULT 'extreme' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_mode_usage_events" ADD CONSTRAINT "agent_mode_usage_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anthropic_usage" ADD CONSTRAINT "anthropic_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_session" ADD CONSTRAINT "build_session_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_session" ADD CONSTRAINT "build_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_usage" ADD CONSTRAINT "google_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mcp_server" ADD CONSTRAINT "user_mcp_server_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agentModeUsageEvents_userId_idx" ON "agent_mode_usage_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agentModeUsageEvents_userId_date_idx" ON "agent_mode_usage_events" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "agentModeUsageEvents_messageId_unique" ON "agent_mode_usage_events" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agentModeUsageEvents_userId_date_messageId_unique" ON "agent_mode_usage_events" USING btree ("user_id","date","message_id");--> statement-breakpoint
CREATE INDEX "anthropicUsage_userId_idx" ON "anthropic_usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "anthropicUsage_userId_date_idx" ON "anthropic_usage" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "anthropicUsage_userId_date_unique" ON "anthropic_usage" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "build_session_chatId_idx" ON "build_session" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "build_session_userId_idx" ON "build_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "build_session_userId_status_idx" ON "build_session" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "googleUsage_userId_idx" ON "google_usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "googleUsage_userId_date_idx" ON "google_usage" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "googleUsage_userId_date_unique" ON "google_usage" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "userMcpServer_userId_idx" ON "user_mcp_server" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "userMcpServer_userId_enabled_idx" ON "user_mcp_server" USING btree ("user_id","is_enabled");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_userId_idx" ON "chat" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "chat_userId_createdAt_idx" ON "chat" USING btree ("userId","created_at");--> statement-breakpoint
CREATE INDEX "chat_userId_isPinned_updatedAt_idx" ON "chat" USING btree ("userId","is_pinned","updated_at");--> statement-breakpoint
CREATE INDEX "customInstructions_userId_idx" ON "custom_instructions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dodosubscription_userId_idx" ON "dodosubscription" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dodosubscription_userId_status_idx" ON "dodosubscription" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "dodosubscription_customerId_idx" ON "dodosubscription" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "extremeSearchUsage_userId_idx" ON "extreme_search_usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "extremeSearchUsage_userId_date_idx" ON "extreme_search_usage" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "extremeSearchUsage_userId_date_unique" ON "extreme_search_usage" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "lookout_userId_idx" ON "lookout" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lookout_userId_status_idx" ON "lookout" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "message_chatId_idx" ON "message" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "message_chatId_createdAt_idx" ON "message" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "messageUsage_userId_idx" ON "message_usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messageUsage_userId_date_idx" ON "message_usage" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "messageUsage_userId_date_unique" ON "message_usage" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stream_chatId_idx" ON "stream" USING btree ("chatId");--> statement-breakpoint
CREATE INDEX "subscription_userId_idx" ON "subscription" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "subscription_userId_status_idx" ON "subscription" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");