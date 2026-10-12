CREATE TABLE "model_catalog_source" (
	"id" text PRIMARY KEY NOT NULL,
	"data" json NOT NULL,
	"fetched_at" timestamp NOT NULL
);
