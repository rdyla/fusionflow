-- Backfill actual_go_live_date from the canonical go-live event task(s)
-- (tasks.is_go_live_event = 1) for projects that already had a real,
-- completed go-live but never got it recorded — nothing wrote to this
-- column until syncProjectGoLiveDate started doing so (see teamUtils.ts).
-- Without this, the Leadership dashboard's "Went Live · Still Open" tile
-- read empty despite real completed go-lives sitting in the data.
--
-- Only fills projects with actual_go_live_date currently NULL — never
-- overwrites a value already set another way (e.g. the Optimize direct
-- enrollment form). completed_at is a full timestamp; only the date
-- portion is kept, matching the app's date-only field.
UPDATE projects
SET actual_go_live_date = (
  SELECT MAX(substr(t.completed_at, 1, 10))
  FROM tasks t
  WHERE t.project_id = projects.id
    AND t.is_go_live_event = 1
    AND t.status = 'completed'
    AND t.completed_at IS NOT NULL
),
updated_at = CURRENT_TIMESTAMP
WHERE actual_go_live_date IS NULL
  AND EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.project_id = projects.id
      AND t.is_go_live_event = 1
      AND t.status = 'completed'
      AND t.completed_at IS NOT NULL
  );
