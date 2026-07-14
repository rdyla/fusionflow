-- Upcoming meetings: PMs enter discrete meeting dates per project; customer and
-- partner contacts see them in a read-only table on the project Overview tab.
-- Supersedes the single recurring status_meeting_* cadence on projects (those
-- columns are intentionally LEFT IN PLACE for now — no longer written, but kept
-- so no data is lost and the stakeholder next_call math keeps compiling).
CREATE TABLE project_meetings (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title              TEXT,
  meeting_date       TEXT NOT NULL,           -- YYYY-MM-DD (local to timezone)
  start_time_local   TEXT,                    -- HH:MM 24h, nullable
  timezone           TEXT,                    -- IANA tz, e.g. America/Los_Angeles
  duration_min       INTEGER,
  join_url           TEXT,
  notes              TEXT,                    -- short agenda / notes
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at         TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Listing is per-project, ordered chronologically.
CREATE INDEX idx_project_meetings_project ON project_meetings(project_id, meeting_date);
