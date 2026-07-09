-- Additional resources on a task, beyond the primary assignee.
--
-- tasks.assignee_user_id / assignee_contact_id remain the PRIMARY resource
-- (kept as-is so dashboard, My Tasks, cascade date-shifting, and assignment
-- emails are untouched). This table holds any EXTRA people assigned to the same
-- task; the Tasks tab renders them as sub-rows beneath the task. Exactly one of
-- user_id (internal staff) or contact_id (customer / partner contact) is set per
-- row.
--
-- All three id columns are FK'd with ON DELETE CASCADE so a join row can never
-- dangle: deleting the task, the user, or the project contact removes the extra
-- assignee row. (The primary tasks.assignee_contact_id uses SET NULL because
-- it's a column on a row we keep; here the whole row IS the association, so
-- cascade-delete is the correct cleanup — otherwise GET /tasks would keep
-- returning a stale "(contact)" resource after a normal contact removal.)
CREATE TABLE task_assignees (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES project_contacts(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_task_assignees_task ON task_assignees (task_id);
