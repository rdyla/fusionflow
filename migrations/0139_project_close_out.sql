-- Deliberate PM-triggered "close out" action, separate from projects.status.
--
-- status is fully auto-derived (src/server/lib/teamUtils.ts syncProjectStatus)
-- from stage/task/risk state and gets recomputed on every task/risk write —
-- there's no durable way to "manually set" it without a later write silently
-- reverting it. closed_at is a standalone flag a PM sets deliberately via
-- POST /projects/:id/close, independent of that recomputation, so an early/
-- forced close (stages not actually finished) can't be clobbered by the next
-- task update. closed_reason is required by the app when closing early
-- (status != 'complete' at close time); optional otherwise.

ALTER TABLE projects ADD COLUMN closed_at TEXT;
ALTER TABLE projects ADD COLUMN closed_reason TEXT;
ALTER TABLE projects ADD COLUMN closed_by_user_id TEXT REFERENCES users(id);
