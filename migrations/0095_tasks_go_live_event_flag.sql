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
-- canonical go-live event titles from migration 0081.
--
-- Tasks created via apply-template get a `[TAG]` prefix from
-- buildTaggedTitle (e.g. `[UCaaS] Go Live Event`), so the backfill strips
-- any leading `[...] ` and compares the raw title.

ALTER TABLE tasks ADD COLUMN is_go_live_event INTEGER NOT NULL DEFAULT 0;

UPDATE tasks SET is_go_live_event = 1
WHERE (
  CASE
    WHEN title LIKE '[%]%' AND INSTR(title, '] ') > 0
      THEN SUBSTR(title, INSTR(title, '] ') + 2)
    ELSE title
  END
) IN ('Go Live Event', 'Cutover Execution', 'Production Cutover', 'Go-Live Execution');
