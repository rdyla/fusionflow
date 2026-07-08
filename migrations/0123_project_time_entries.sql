-- Project-level "admin time" entries.
--
-- Mirrors stage_time_entries (0105) exactly, but the time is NOT tied to any
-- task or stage — it logs general project/admin work against the project's CRM
-- case + job. Same Dynamics 365 amc_timeentry submission (related to the
-- project's CRM case + job); only the local association (project, not stage)
-- and the CRM subject ("Project Admin | {note}") differ.
--
-- Additive: task_time_entries and stage_time_entries are left in place. This is
-- a third, project-scoped shadow table alongside them.

CREATE TABLE project_time_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  crm_time_entry_id TEXT,
  scheduled_start TEXT NOT NULL,
  scheduled_end TEXT NOT NULL,
  pay_code_id TEXT,
  cost_code_id TEXT,
  note TEXT,
  user_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_project_time_entries_project ON project_time_entries (project_id);
