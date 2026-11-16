-- Custom providers carry a trust class instead of an anonymize flag. A
-- provider that was anonymized is an outside service; one that was not keeps
-- receiving cleartext, which is what a local provider gets.
UPDATE "user_preferences"
SET "preferences" = jsonb_set(
  "preferences"::jsonb,
  '{zetora-custom-providers}',
  (
    SELECT coalesce(
      jsonb_agg(
        (provider - 'anonymize') || jsonb_build_object(
          'trust',
          CASE WHEN provider ->> 'anonymize' = 'true' THEN 'external' ELSE 'local' END
        )
        ORDER BY position
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements("preferences"::jsonb -> 'zetora-custom-providers') WITH ORDINALITY AS entries(provider, position)
  )
)::json
WHERE jsonb_typeof("preferences"::jsonb -> 'zetora-custom-providers') = 'array';
