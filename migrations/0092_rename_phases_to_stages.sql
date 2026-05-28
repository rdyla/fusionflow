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

-- Foreign-key columns on dependent tables
ALTER TABLE milestones       RENAME COLUMN phase_id TO stage_id;
ALTER TABLE tasks            RENAME COLUMN phase_id TO stage_id;
ALTER TABLE documents        RENAME COLUMN phase_id TO stage_id;
ALTER TABLE zoom_recordings  RENAME COLUMN phase_id TO stage_id;
ALTER TABLE template_tasks   RENAME COLUMN phase_id TO stage_id;
