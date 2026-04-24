-- Migrate projects.solution_type (TEXT) → projects.solution_types (JSON array in TEXT).
-- Test data only, so no soak period — backfill and drop the old column.

ALTER TABLE projects ADD COLUMN solution_types TEXT NOT NULL DEFAULT '[]';

UPDATE projects
SET solution_types = json_array(solution_type)
WHERE solution_type IS NOT NULL AND solution_type != '';

ALTER TABLE projects DROP COLUMN solution_type;
