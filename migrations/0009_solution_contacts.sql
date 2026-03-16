CREATE TABLE solution_contacts (
  id TEXT PRIMARY KEY,
  solution_id TEXT NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
  dynamics_contact_id TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  job_title TEXT,
  contact_role TEXT,
  added_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_solution_contacts_solution_id ON solution_contacts(solution_id);
