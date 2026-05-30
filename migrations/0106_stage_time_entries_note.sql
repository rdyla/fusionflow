-- Add a free-text note to stage time entries.
--
-- 0105 (the stage_time_entries table) already shipped without this column, so
-- it can't be edited retroactively — wrangler won't re-run an applied
-- migration. Add the column here instead.
--
-- The note is combined into the CRM subject as "{stage} | {note}" at submit
-- time and shown in the per-stage time-entry list.

ALTER TABLE stage_time_entries ADD COLUMN note TEXT;
