-- Step 2 of the nomenclature swap (follows 0092 which renamed
-- phases → stages). With the "phases" name now free, the
-- `sites` table is renamed to "phases" — its rows have always
-- represented rollout / go-live phases (Sports Complex, Corp Yard,
-- Barrett Community Center, etc.), not physical locations.
-- (The migration file 0085 is called *project_sites* but the table
-- it creates is named `sites`.)
--
-- Dependent FK columns: stages.site_id, tasks.site_id, and
-- meeting_prep_sends.site_id all become phase_id.

ALTER TABLE sites RENAME TO phases;

ALTER TABLE stages             RENAME COLUMN site_id TO phase_id;
ALTER TABLE tasks              RENAME COLUMN site_id TO phase_id;
ALTER TABLE meeting_prep_sends RENAME COLUMN site_id TO phase_id;
