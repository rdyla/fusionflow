-- Many-to-one send history for the meeting-prep email engine.
--
-- Prior model (PR #62 → #76 → #77): one *_sent_at column per meeting type
-- on `projects`, capturing only the most recent send. New model: every send
-- gets its own row in `meeting_prep_sends`, supporting multiple discoveries
-- per project (e.g. "Discovery: Network", "Discovery: Call Flows") and a
-- visible history per type.
--
-- The `label` column distinguishes multiple sends of the same type. Free-form,
-- optional — the modal renders it as a sub-label and the card shows it on the
-- per-send line.

CREATE TABLE meeting_prep_sends (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL,
  meeting_type     TEXT NOT NULL,        -- kickoff | discovery | design_review | uat | go_live
  label            TEXT,                  -- optional, e.g. "Network Architecture"
  subject          TEXT NOT NULL,
  recipient_emails TEXT NOT NULL,         -- JSON array of strings
  sent_by_user_id  TEXT,
  sent_at          TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_meeting_prep_sends_project_type
  ON meeting_prep_sends(project_id, meeting_type, sent_at DESC);

-- Backfill kickoff history from the now-redundant projects.kickoff_sent_at column
-- (recipient_emails left as [] since we never persisted them).
INSERT INTO meeting_prep_sends (id, project_id, meeting_type, subject, recipient_emails, sent_at)
SELECT
  lower(hex(randomblob(16))),
  id,
  'kickoff',
  'Welcome to ' || COALESCE(name, 'Project'),
  '[]',
  kickoff_sent_at
FROM projects
WHERE kickoff_sent_at IS NOT NULL;

ALTER TABLE projects DROP COLUMN kickoff_sent_at;
