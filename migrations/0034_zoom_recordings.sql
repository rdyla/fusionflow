-- Store Zoom cloud recordings linked to project phases
CREATE TABLE IF NOT EXISTS zoom_recordings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  phase_id TEXT,                    -- NULL = unassigned
  meeting_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  start_time TEXT NOT NULL,         -- ISO 8601
  duration_mins INTEGER NOT NULL DEFAULT 0,
  host_email TEXT,
  recording_files TEXT NOT NULL DEFAULT '[]',  -- JSON array of recording file objects
  match_reason TEXT,                -- 'case_number' | 'keyword:<phase_name>' | 'date_range' | 'manual'
  manually_assigned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (phase_id) REFERENCES phases(id) ON DELETE SET NULL,
  UNIQUE (project_id, meeting_id)
);
