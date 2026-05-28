-- Consolidate duplicate Initiate stages introduced by the template-apply
-- bug (fixed in this same PR). When the apply-template flow ran on a
-- phase whose project already had a shared Initiate stage (phase_id =
-- NULL), it failed to reuse the shared row and inserted a second
-- Initiate scoped to the phase. The Tasks tab's per-phase picker then
-- rendered TWO Initiate columns — one populated by the original combo
-- template, one by the second per-phase template.
--
-- Cleanup strategy:
--   1. For every Initiate-titled task, re-point it at the project's
--      "canonical" Initiate stage: the shared one if present, else the
--      lowest-id one (stable tie-break).
--   2. Delete any Initiate stage that's now empty AND has a sibling
--      Initiate stage in the same project to inherit ownership.
--
-- "Initiate" / "Initiation" both match (case-insensitive, trimmed) so
-- we cover the template names actually used in template_stages.

UPDATE tasks
SET stage_id = (
  SELECT s.id FROM stages s
  WHERE s.project_id = tasks.project_id
    AND LOWER(TRIM(s.name)) IN ('initiate', 'initiation')
  ORDER BY (CASE WHEN s.phase_id IS NULL THEN 0 ELSE 1 END) ASC, s.id ASC
  LIMIT 1
)
WHERE stage_id IN (
  SELECT id FROM stages
  WHERE LOWER(TRIM(name)) IN ('initiate', 'initiation')
);

DELETE FROM stages
WHERE LOWER(TRIM(name)) IN ('initiate', 'initiation')
  AND NOT EXISTS (SELECT 1 FROM tasks WHERE stage_id = stages.id)
  AND EXISTS (
    SELECT 1 FROM stages s2
    WHERE s2.project_id = stages.project_id
      AND LOWER(TRIM(s2.name)) IN ('initiate', 'initiation')
      AND s2.id != stages.id
  );
