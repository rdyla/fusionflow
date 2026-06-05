-- External Resources: outside vendor / contractor engagements on a project
-- (e.g. a Field Nation tech sent to site). PMs/admins track each engagement
-- here; the summed dollar amount surfaces on the CRM Case tab as additional
-- "hours used" (amount / 165 blended rate) and as a billable total at close.
CREATE TABLE project_external_resources (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  engagement_date     TEXT,                       -- yyyy-MM-dd
  contractor_name     TEXT NOT NULL,
  contractor_email    TEXT,
  task_description     TEXT,
  amount              REAL NOT NULL DEFAULT 0,    -- USD
  -- Engagement lifecycle: new | posted | assigned | in_progress | closed | billed
  status              TEXT NOT NULL DEFAULT 'new',
  notes               TEXT,
  created_by_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at          TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_project_external_resources_project
  ON project_external_resources(project_id);
