-- Phase-level CRM case + SharePoint sub-folder.
--
-- Companion to migration 0119_phase_people_visibility.sql. On phase-scoped
-- projects (e.g. LACCD: one project, ~10 campus phases) each PHASE tracks
-- against its own Dynamics 365 case for time entries/accounting and lives
-- in its own SharePoint sub-folder under the project's main folder.
--
-- "Phases" here are deployment phases / campuses (the top-level grouping
-- added in migration 0085 — sites/phases for multi-site projects), NOT
-- the PMI lifecycle stages (Initiate/Plan/Execute) that live in `stages`.
-- Each phase contains its own stages chain; the stage's phase_id links
-- back here for case/folder lookup.
--
-- Both columns are nullable + only meaningful for projects where
-- `projects.phase_scoped_visibility = 1`. Stages on single-phase projects
-- continue rolling up to the project-level case + folder unchanged.

-- Manual picker — PM links the phase to a CAS-XXXXX case via the same UI
-- as the project-level CRM case picker. Time-entry submission prefers
-- this value (resolved via stage.phase_id), falls back to
-- projects.crm_case_id when null.
ALTER TABLE phases ADD COLUMN crm_case_id TEXT;

-- Auto-created sub-folder under projects.sharepoint_folder_url. Stored as
-- the full webUrl (matches projects.sharepoint_folder_url shape).
-- Provisioned at phase-creation time when the parent project has
-- phase_scoped_visibility=1 AND the project's own sharepoint_folder_url
-- is set. Otherwise stays null and is retro-fitable via a per-phase
-- "Create folder" action.
ALTER TABLE phases ADD COLUMN sharepoint_folder_url TEXT;
