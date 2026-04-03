-- ── Remove redundant team columns — account team now lives on customers ─────────
-- Columns with table-level FK constraints cannot use DROP COLUMN in SQLite;
-- those tables are recreated. All data is test data — safe to truncate if needed.

PRAGMA foreign_keys = OFF;

-- ── projects: recreate without ae_user_id (table-level FK blocks DROP COLUMN) ──
CREATE TABLE projects_new (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  customer_name       TEXT,
  vendor              TEXT,
  solution_type       TEXT,
  status              TEXT,
  health              TEXT,
  kickoff_date        TEXT,
  target_go_live_date TEXT,
  actual_go_live_date TEXT,
  pm_user_id          TEXT,
  created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at          TEXT DEFAULT CURRENT_TIMESTAMP,
  dynamics_account_id TEXT,
  archived            INTEGER DEFAULT 0,
  asana_project_id    TEXT,
  managed_in_asana    INTEGER DEFAULT 0,
  health_override     TEXT,
  solution_id         TEXT,
  customer_id         TEXT,
  crm_case_id         TEXT,
  crm_opportunity_id  TEXT,
  FOREIGN KEY(pm_user_id)  REFERENCES users(id),
  FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

INSERT INTO projects_new
  SELECT id, name, customer_name, vendor, solution_type, status, health,
         kickoff_date, target_go_live_date, actual_go_live_date,
         pm_user_id, created_at, updated_at, dynamics_account_id,
         archived, asana_project_id, managed_in_asana, health_override,
         solution_id, customer_id, crm_case_id, crm_opportunity_id
  FROM projects;

DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;

-- ── optimize_accounts: recreate without ae/sa/csm_user_id ────────────────────
CREATE TABLE optimize_accounts_new (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL UNIQUE,
  graduated_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  graduated_by      TEXT,
  graduation_method TEXT NOT NULL DEFAULT 'auto',
  optimize_status   TEXT NOT NULL DEFAULT 'active',
  next_review_date  TEXT,
  notes             TEXT,
  customer_id       TEXT,
  created_at        TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at        TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id)   REFERENCES projects(id),
  FOREIGN KEY(graduated_by) REFERENCES users(id),
  FOREIGN KEY(customer_id)  REFERENCES customers(id) ON DELETE SET NULL
);

INSERT INTO optimize_accounts_new
  SELECT id, project_id, graduated_at, graduated_by, graduation_method,
         optimize_status, next_review_date, notes, customer_id,
         created_at, updated_at
  FROM optimize_accounts;

DROP TABLE optimize_accounts;
ALTER TABLE optimize_accounts_new RENAME TO optimize_accounts;

-- ── solutions: drop the three pf_*_user_id columns ───────────────────────────
-- These were added via ALTER TABLE so they have inline FKs, but they still
-- cannot be dropped while FK enforcement is on — safe with FK off.
ALTER TABLE solutions DROP COLUMN pf_ae_user_id;
ALTER TABLE solutions DROP COLUMN pf_sa_user_id;
ALTER TABLE solutions DROP COLUMN pf_csm_user_id;

-- ── Clean up staff records that duplicated customer team ──────────────────────
DELETE FROM project_staff WHERE staff_role IN ('ae', 'sa', 'csm');
DELETE FROM solution_staff;

PRAGMA foreign_keys = ON;
