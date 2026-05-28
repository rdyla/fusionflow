-- Tasks carry the same `is_go_live_event` flag that lives on template_tasks
-- (from migration 0081), so a project's target_go_live_date can be derived
-- from the canonical go-live task's due_date instead of being a free-form
-- input on the Overview tab.
--
-- On multi-phase projects (multiple rollout phases, each with its own
-- go-live), there can be multiple flagged tasks; project.target_go_live_date
-- is the MAX of their due_dates (i.e. the FINAL go-live across the project).
--
-- Backfill: existing projects don't carry the flag through template apply
-- (template apply pre-dated this column), so we match by title against the
-- known canonical go-live event titles. Titles may carry a solution-type
-- suffix from buildTaggedTitle (e.g. "Go Live Event · UCaaS"), so we use
-- LIKE with a wildcard.

ALTER TABLE tasks ADD COLUMN is_go_live_event INTEGER NOT NULL DEFAULT 0;

-- Backfill known canonical titles (from migration 0081's flagged template_tasks)
UPDATE tasks SET is_go_live_event = 1
WHERE title LIKE 'Go Live Event%'
   OR title LIKE 'Cutover Execution%'
   OR title LIKE 'Production Cutover%'
   OR title LIKE 'Go-Live Execution%';
