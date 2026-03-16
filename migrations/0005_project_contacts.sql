CREATE TABLE project_contacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dynamics_contact_id TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  job_title TEXT,
  added_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_project_contacts_project_id ON project_contacts(project_id);
