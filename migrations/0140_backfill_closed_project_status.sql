-- Backfill status/health on projects closed before the freeze fix landed.
--
-- POST /projects/:id/close originally only set closed_at/closed_reason/
-- closed_by_user_id, leaving status and health showing whatever they were
-- at close time (e.g. "in_progress" / "on_track") — reading on the Projects
-- list as if closing had no effect. Fixed going forward so the close action
-- itself now also freezes status='complete' and health='completed' (pinned
-- via health_override so the daily health-scoring cron can't recompute it
-- back). This repairs any project that was closed under the old behavior,
-- before that fix deployed.
UPDATE projects
SET status = 'complete',
    health = 'completed',
    health_override = 'completed'
WHERE closed_at IS NOT NULL
  AND (status != 'complete' OR health_override IS NULL);
