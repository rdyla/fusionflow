CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  phase_id TEXT,
  task_id TEXT,
  name TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  category TEXT,
  uploaded_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id),
  FOREIGN KEY(phase_id) REFERENCES phases(id),
  FOREIGN KEY(task_id) REFERENCES tasks(id),
  FOREIGN KEY(uploaded_by) REFERENCES users(id)
);
