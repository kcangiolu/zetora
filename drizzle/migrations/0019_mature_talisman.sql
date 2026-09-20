CREATE TABLE "hermes_connector" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"gateway_id" text,
	"label" text,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"enrollment_token_hash" text,
	"enrollment_token_expires_at" timestamp,
	"gateway_secret_encrypted" text,
	"gateway_secret_prefix" text,
	"last_connected_at" timestamp,
	"last_disconnected_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hermes_connector_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "hermes_connector_gateway_id_unique" UNIQUE("gateway_id")
);
--> statement-breakpoint
CREATE TABLE "hermes_conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hermes_conversation_chat_id_unique" UNIQUE("chat_id")
);
--> statement-breakpoint
CREATE TABLE "hermes_message_link" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"hermes_message_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hermes_message_link_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh_key" text NOT NULL,
	"auth_key" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "hermes_connector" ADD CONSTRAINT "hermes_connector_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hermes_conversation" ADD CONSTRAINT "hermes_conversation_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hermes_conversation" ADD CONSTRAINT "hermes_conversation_connector_id_hermes_connector_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."hermes_connector"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hermes_message_link" ADD CONSTRAINT "hermes_message_link_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hermesConnector_userId_idx" ON "hermes_connector" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hermesConnector_gatewayId_idx" ON "hermes_connector" USING btree ("gateway_id");--> statement-breakpoint
CREATE INDEX "hermesConversation_connectorId_idx" ON "hermes_conversation" USING btree ("connector_id");--> statement-breakpoint
CREATE INDEX "hermesMessageLink_hermesMessageId_idx" ON "hermes_message_link" USING btree ("hermes_message_id");--> statement-breakpoint
CREATE INDEX "pushSubscription_userId_idx" ON "push_subscription" USING btree ("user_id");