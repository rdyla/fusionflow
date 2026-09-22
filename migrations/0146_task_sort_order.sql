-- Lets a PM control the relative order of tasks within a stage that share
-- the same due_date. Tasks list orders by (due_date, sort_order) — this
-- column is only ever a tiebreaker within a date, never a primary sort key.
ALTER TABLE tasks ADD COLUMN sort_order INTEGER;

-- Backfill a stable baseline for existing tasks using their current
-- (implicit, rowid) order within each stage, so nothing visibly reshuffles
-- the moment this ships. Tasks with no stage keep sort_order NULL — there's
-- no stage to group ties within, and NULL sorts consistently either way.
UPDATE tasks
SET sort_order = ranked.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY stage_id ORDER BY rowid) - 1 AS rn
  FROM tasks
  WHERE stage_id IS NOT NULL
) AS ranked
WHERE tasks.id = ranked.id;
