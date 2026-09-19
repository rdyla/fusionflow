-- Eligibility flags for three new project staff roles: Trainer, Integrations
-- and Specialist. Requested by Jacqui White via the roadmap table 2026-08-26
-- ("Add additional roles of Trainer, Integrations, Specialist").
--
-- Per-role flags rather than reusing is_project_resource: that flag already
-- means "assignable as Implementation Engineer or PM", and widening it would
-- have put every IE into the Trainer and Specialist pickers too.
--
-- These are picker-eligibility flags, read from the users LIST endpoint — not
-- from the cached AppUser session blob — so unlike a permission flag they take
-- effect without the affected user logging out and back in.
ALTER TABLE users ADD COLUMN is_trainer INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN is_integrations INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN is_specialist INTEGER NOT NULL DEFAULT 0;
