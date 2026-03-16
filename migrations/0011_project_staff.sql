-- ── Project & Solution Staff ─────────────────────────────────────────────────
-- Replaces text-only pm_name/ae_name/sa_name/csm_name/engineer_name columns
-- with proper FK-linked multi-staff assignments.

CREATE TABLE project_staff (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  staff_role TEXT NOT NULL,   -- 'ae' | 'sa' | 'csm' | 'engineer'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, user_id, staff_role),
  FOREIGN KEY(project_id) REFERENCES projects(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE solution_staff (
  id TEXT PRIMARY KEY,
  solution_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  staff_role TEXT NOT NULL,   -- 'pf_ae' | 'pf_sa'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(solution_id, user_id, staff_role),
  FOREIGN KEY(solution_id) REFERENCES solutions(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
