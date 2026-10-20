-- File search gets its own custom embedding model instead of sharing the
-- hybrid-search one: carry the shared pick over for users already on a
-- custom file embedding, and drop the never-read display copy of it.
UPDATE "user_preferences"
SET "preferences" = (
  "preferences"::jsonb
  || jsonb_build_object('zetora-file-embedding-model', "preferences"::jsonb -> 'zetora-embedding-provider')
)::json
WHERE "preferences"::jsonb ->> 'zetora-file-embedding-provider' = 'custom'
  AND "preferences"::jsonb ? 'zetora-embedding-provider';--> statement-breakpoint
UPDATE "user_preferences"
SET "preferences" = ("preferences"::jsonb - 'zetora-embedding-model')::json
WHERE "preferences"::jsonb ? 'zetora-embedding-model';
