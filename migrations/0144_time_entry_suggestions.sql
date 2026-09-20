-- "What did I do last week?" — suggested time entries built from Zoom
-- recordings and Outlook calendar events, matched to the user's active
-- projects. Personal convenience feature for Ryan; flagged off by default.
--
-- SUGGESTIONS ARE NEVER AUTO-SUBMITTED. Confirming one posts through the
-- existing POST /projects/:id/time-entries path, which creates the D365
-- amc_timeentry AND immediately closes it — payroll only picks up Completed
-- entries. A wrong auto-match would therefore be a closed, billable payroll
-- record counted against SOW hours compliance, not a dismissible UI hint.
-- Hence: suggest, human confirms, existing write path does the rest.
ALTER TABLE users ADD COLUMN is_time_assist INTEGER NOT NULL DEFAULT 0;

-- Meetings the user has explicitly waved off, so a weekly review doesn't keep
-- re-offering the same internal stand-up. Keyed by source event id rather than
-- by time, so a rescheduled meeting is offered again (it's genuinely new work).
CREATE TABLE time_entry_suggestion_dismissals (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source          TEXT NOT NULL,              -- 'zoom' | 'outlook'
  source_event_id TEXT NOT NULL,
  dismissed_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One dismissal per event per user; the insert is idempotent on re-dismiss.
CREATE UNIQUE INDEX idx_time_dismissals_unique
  ON time_entry_suggestion_dismissals(user_id, source, source_event_id);
