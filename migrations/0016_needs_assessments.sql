CREATE TABLE IF NOT EXISTS needs_assessments (
  id TEXT PRIMARY KEY,
  solution_id TEXT NOT NULL UNIQUE,
  survey_id TEXT NOT NULL DEFAULT 'ci_needs_assessment_unified_v1',
  answers TEXT NOT NULL DEFAULT '{}',
  readiness_score INTEGER,
  readiness_status TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (solution_id) REFERENCES solutions(id) ON DELETE CASCADE
);
