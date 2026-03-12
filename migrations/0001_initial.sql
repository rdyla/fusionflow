-- USERS
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  organization_name TEXT,
  role TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- PROJECTS
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  customer_name TEXT,
  vendor TEXT,
  solution_type TEXT,
  status TEXT,
  health TEXT,
  kickoff_date TEXT,
  target_go_live_date TEXT,
  actual_go_live_date TEXT,
  pm_user_id TEXT,
  ae_user_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(pm_user_id) REFERENCES users(id),
  FOREIGN KEY(ae_user_id) REFERENCES users(id)
);

-- PHASES
CREATE TABLE phases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER,
  planned_start TEXT,
  planned_end TEXT,
  actual_start TEXT,
  actual_end TEXT,
  status TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

-- MILESTONES
CREATE TABLE milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  phase_id TEXT,
  name TEXT NOT NULL,
  target_date TEXT,
  actual_date TEXT,
  status TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id),
  FOREIGN KEY(phase_id) REFERENCES phases(id)
);

-- TASKS
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  phase_id TEXT,
  title TEXT NOT NULL,
  assignee_user_id TEXT,
  due_date TEXT,
  completed_at TEXT,
  status TEXT,
  priority TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id),
  FOREIGN KEY(phase_id) REFERENCES phases(id),
  FOREIGN KEY(assignee_user_id) REFERENCES users(id)
);

-- RISKS
CREATE TABLE risks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT,
  status TEXT,
  owner_user_id TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id),
  FOREIGN KEY(owner_user_id) REFERENCES users(id)
);

-- NOTES / ACTIVITY
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  author_user_id TEXT,
  body TEXT NOT NULL,
  visibility TEXT DEFAULT 'internal',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id),
  FOREIGN KEY(author_user_id) REFERENCES users(id)
);

-- PROJECT ACCESS
CREATE TABLE project_access (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  access_level TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);