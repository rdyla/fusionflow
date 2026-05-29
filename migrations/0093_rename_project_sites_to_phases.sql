-- Step 2 of the nomenclature swap (follows 0092 which renamed
-- phases → stages). With the "phases" name now free, the
-- `sites` table is renamed to "phases" — its rows have always
-- represented rollout / go-live phases (Sports Complex, Corp Yard,
-- Barrett Community Center, etc.), not physical locations.
-- (The migration file 0085 is called *project_sites* but the table
-- it creates is named `sites`.)
--
-- Dependent FK columns: stages.site_id (from 0085) and
-- meeting_prep_sends.site_id (from 0086) become phase_id.
--
-- NOTE: tasks does NOT have a site_id column — task-to-phase mapping
-- is derived via stages.phase_id (join through the stages table).
-- An earlier scope pass mistakenly listed tasks.site_id as an FK.

ALTER TABLE sites RENAME TO phases;

ALTER TABLE stages             RENAME COLUMN site_id TO phase_id;
ALTER TABLE meeting_prep_sends RENAME COLUMN site_id TO phase_id;
