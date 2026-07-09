-- Additional resources on a task, beyond the primary assignee.
--
-- tasks.assignee_user_id / assignee_contact_id remain the PRIMARY resource
-- (kept as-is so dashboard, My Tasks, cascade date-shifting, and assignment
-- emails are untouched). This table holds any EXTRA people assigned to the same
-- task; the Tasks tab renders them as sub-rows beneath the task. Exactly one of
-- user_id (internal staff) or contact_id (customer / partner contact) is set per
-- row. FK to tasks so removing a task cleans up its extra assignees.
CREATE TABLE task_assignees (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT,
  contact_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_task_assignees_task ON task_assignees (task_id);
