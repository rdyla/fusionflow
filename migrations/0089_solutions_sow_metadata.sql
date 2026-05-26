-- SOW metadata blob for the rebuilt SOW renderer.
--
-- Stores:
--   - msa_date: PM-entered Master Services Agreement date for the cover page.
--   - revisions: append-only array of versions. Each "Generate Version" click
--     in the SOW page pushes a new row { version, saved_at, saved_by_user_id,
--     saved_by_name, note? }. The latest entry's version is the SOW's current
--     version; the array doubles as the revision-history table on the cover
--     page.
--
-- Schema-as-JSON-blob mirrors how `solutions.sow_data` already works (sizing
-- form state). One blob per solution keeps the migration footprint small and
-- doesn't need a relational join on every SOW render.

ALTER TABLE solutions ADD COLUMN sow_metadata TEXT;
