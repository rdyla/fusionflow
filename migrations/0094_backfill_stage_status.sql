-- Stage status is now auto-derived from task statuses (May-2026).
-- Recompute every existing stage so the stored value matches the new
-- derivation rule, on the first deploy after the code change.
--
-- Rule:
--   any task in_progress or completed → 'in_progress'
--   all tasks completed (≥1 task)     → 'completed'
--   else (empty stage / all not_started) → 'not_started'

UPDATE stages
SET status = (
  SELECT CASE
    WHEN COUNT(t.id) = 0 THEN 'not_started'
    WHEN SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) = COUNT(t.id) THEN 'completed'
    WHEN SUM(CASE WHEN t.status IN ('in_progress', 'completed') THEN 1 ELSE 0 END) > 0 THEN 'in_progress'
    ELSE 'not_started'
  END
  FROM tasks t
  WHERE t.stage_id = stages.id
);
