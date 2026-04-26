-- Rename projects.welcome_sent_at → kickoff_sent_at to match the new
-- meeting-prep engine vocabulary. The data is unchanged — kickoff is the
-- only meeting type today; future types will get their own *_sent_at
-- columns alongside this one.

ALTER TABLE projects RENAME COLUMN welcome_sent_at TO kickoff_sent_at;
