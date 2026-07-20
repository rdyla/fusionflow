-- Per-project Zoom email alias / distribution list (e.g. zm-sanford@packetfusion.com).
-- The PM sets this in the welcome/kickoff meeting-prep flow (a shortened form of
-- the auto-derived zm-{slug}@packetfusion.com). Persisting it lets future
-- meeting-prep sends reuse the real alias instead of re-deriving the long form,
-- surfaces it in the project meta, and lets us prompt the helpdesk team to
-- create the mailbox when it's first set/changed.
ALTER TABLE projects ADD COLUMN zoom_email_alias TEXT;
