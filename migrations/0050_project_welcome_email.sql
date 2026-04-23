-- Project welcome package email: track kickoff meeting URL (surfaced in the
-- welcome email body) and timestamp the last send for a sent/resend status
-- indicator in the project overview.
ALTER TABLE projects ADD COLUMN kickoff_meeting_url TEXT;
ALTER TABLE projects ADD COLUMN welcome_sent_at TEXT;
