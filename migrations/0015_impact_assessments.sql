CREATE TABLE IF NOT EXISTS impact_assessments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  survey_id TEXT NOT NULL DEFAULT 'client_impact_assessment_unified_v1',
  conducted_date TEXT NOT NULL,
  conducted_by_user_id TEXT REFERENCES users(id),
  solution_types TEXT NOT NULL DEFAULT '[]',
  answers TEXT NOT NULL DEFAULT '{}',
  section_scores TEXT,
  solution_scores TEXT,
  overall_score INTEGER,
  confidence_score INTEGER,
  health_band TEXT,
  recommended_actions TEXT,
  insights TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
