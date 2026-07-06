CREATE TABLE "pii_alias" (
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"entity_type" text NOT NULL,
	"original_enc" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pii_alias_user_id_token_pk" PRIMARY KEY("user_id","token")
);
--> statement-breakpoint
ALTER TABLE "pii_alias" ADD CONSTRAINT "pii_alias_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "piiAlias_userId_idx" ON "pii_alias" USING btree ("user_id");