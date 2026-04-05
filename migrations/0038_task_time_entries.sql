CREATE TABLE task_time_entries (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  crm_time_entry_id TEXT,
  scheduled_start TEXT,
  scheduled_end TEXT,
  pay_code_id TEXT,
  cost_code_id TEXT,
  user_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
