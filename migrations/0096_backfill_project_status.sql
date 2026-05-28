-- Project status is now auto-derived from stages + open blockers (May-2026)
-- via teamUtils.syncProjectStatus. Backfill every project's stored status
-- using the same rule so existing rows line up with the new derivation
-- immediately after deploy.
--
-- Precedence (top wins):
--   1. any task in 'blocked' status OR any open risk          → 'blocked'
--   2. ≥ 1 stage AND every stage status = 'completed'         → 'complete'
--   3. any stage status = 'in_progress'                       → 'in_progress'
--   4. else (no stages, or all not_started)                   → 'not_started'

UPDATE projects SET
  status = (
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM tasks WHERE project_id = projects.id AND status = 'blocked') THEN 'blocked'
      WHEN EXISTS (SELECT 1 FROM risks WHERE project_id = projects.id AND status = 'open')    THEN 'blocked'
      WHEN EXISTS (SELECT 1 FROM stages WHERE project_id = projects.id)
           AND NOT EXISTS (SELECT 1 FROM stages WHERE project_id = projects.id AND status != 'completed')
           THEN 'complete'
      WHEN EXISTS (SELECT 1 FROM stages WHERE project_id = projects.id AND status = 'in_progress') THEN 'in_progress'
      ELSE 'not_started'
    END
  ),
  updated_at = CURRENT_TIMESTAMP;
