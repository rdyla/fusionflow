-- Stage-level time entries.
--
-- Time entry was originally logged against individual tasks (0037/0038,
-- task_time_entries). Per stakeholder request, time is now entered per STAGE
-- (e.g. "Initiate", "Execute") rather than per task — one Log Time action at
-- the top of each stage group. Same Dynamics 365 msdyn_timeentry submission
-- (related to the project's CRM case + job); only the local association and
-- the CRM subject (stage name) differ.
--
-- Additive: task_time_entries is left in place so any historical per-task
-- entries are preserved. New entries land here.

CREATE TABLE stage_time_entries (
  id TEXT PRIMARY KEY,
  stage_id TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  crm_time_entry_id TEXT,
  scheduled_start TEXT,
  scheduled_end TEXT,
  pay_code_id TEXT,
  cost_code_id TEXT,
  user_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_stage_time_entries_stage ON stage_time_entries (stage_id);
CREATE INDEX idx_stage_time_entries_project ON stage_time_entries (project_id);
