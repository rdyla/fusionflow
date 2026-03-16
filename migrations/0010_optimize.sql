-- ── Optimize Module: Phase A ───────────────────────────────────────────────────
-- Projects that have graduated from Implementation into the Optimize lifecycle.

CREATE TABLE optimize_accounts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  graduated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  graduated_by TEXT,                       -- user who triggered graduation
  graduation_method TEXT NOT NULL DEFAULT 'auto', -- 'auto' | 'manual'
  sa_user_id TEXT,                         -- assigned Solution Architect
  csm_user_id TEXT,                        -- assigned CSM (any user)
  optimize_status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'paused' | 'churned'
  next_review_date TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id),
  FOREIGN KEY(graduated_by) REFERENCES users(id),
  FOREIGN KEY(sa_user_id) REFERENCES users(id),
  FOREIGN KEY(csm_user_id) REFERENCES users(id)
);

-- Periodic impact/adoption assessments conducted during review calls.
CREATE TABLE assessments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  assessment_type TEXT NOT NULL DEFAULT 'impact', -- 'impact' | 'adoption' | 'qbr' | 'other'
  conducted_date TEXT NOT NULL,
  conducted_by_user_id TEXT,
  overall_score INTEGER,      -- 1–10
  adoption_score INTEGER,     -- 1–10
  satisfaction_score INTEGER, -- 1–10
  notes TEXT,
  action_items TEXT,
  next_review_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id),
  FOREIGN KEY(conducted_by_user_id) REFERENCES users(id)
);

-- Point-in-time utilization data pulled from Zoom / RingCentral APIs.
CREATE TABLE utilization_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  platform TEXT NOT NULL,         -- 'zoom' | 'ringcentral'
  snapshot_date TEXT NOT NULL,
  licenses_purchased INTEGER,
  licenses_assigned INTEGER,
  active_users_30d INTEGER,
  active_users_90d INTEGER,
  total_meetings INTEGER,         -- Zoom: meeting count in period
  total_call_minutes INTEGER,     -- RingCentral: call minutes in period
  raw_data TEXT,                  -- JSON blob for platform-specific extras
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

-- Technology stack areas per account with Gartner TIME ratings.
CREATE TABLE account_tech_stack (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  tech_area TEXT NOT NULL,        -- 'uc' | 'security' | 'network' | 'datacenter' | 'backup_dr' | 'tem' | 'other'
  tech_area_label TEXT,           -- custom label when tech_area = 'other'
  current_vendor TEXT,
  current_solution TEXT,
  time_rating TEXT,               -- 'tolerate' | 'invest' | 'migrate' | 'eliminate'
  notes TEXT,
  last_reviewed TEXT,
  reviewed_by_user_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id),
  FOREIGN KEY(reviewed_by_user_id) REFERENCES users(id)
);

-- Roadmap items: enhancement seeds and future project opportunities.
CREATE TABLE roadmap_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  tech_stack_id TEXT,             -- optional link to the tech area that spawned this
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'enhancement', -- 'enhancement' | 'new_project' | 'optimization' | 'replacement'
  priority TEXT NOT NULL DEFAULT 'medium',       -- 'high' | 'medium' | 'low'
  time_rating TEXT,               -- 'tolerate' | 'invest' | 'migrate' | 'eliminate'
  status TEXT NOT NULL DEFAULT 'identified',     -- 'identified' | 'evaluating' | 'approved' | 'in_progress' | 'completed' | 'deferred'
  target_date TEXT,
  linked_solution_id TEXT,        -- if promoted to a Solution
  linked_project_id TEXT,         -- if promoted to a new Project
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id),
  FOREIGN KEY(tech_stack_id) REFERENCES account_tech_stack(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
);
