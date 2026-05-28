-- Rename the lifecycle "phases" concept to "stages" to match the customer-
-- facing terminology used in external presentations. The word "phases" will
-- later be repurposed (in a follow-up migration) for what we call "sites"
-- today (multi-site rollouts).
--
-- This migration only renames the `phases` family. Sites still live under
-- `project_sites` until the follow-up migration.

-- Core tables
ALTER TABLE phases RENAME TO stages;
ALTER TABLE template_phases RENAME TO template_stages;

-- Foreign-key columns on dependent tables.
-- NOTE: `milestones` was dropped in migration 0041; not renamed here
-- (it still appears in 0001_initial.sql but does not exist on
-- staging/prod, so a rename would fail).
ALTER TABLE tasks            RENAME COLUMN phase_id TO stage_id;
ALTER TABLE documents        RENAME COLUMN phase_id TO stage_id;
ALTER TABLE zoom_recordings  RENAME COLUMN phase_id TO stage_id;
ALTER TABLE template_tasks   RENAME COLUMN phase_id TO stage_id;
