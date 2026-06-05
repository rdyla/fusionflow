-- On-hold flag for projects. Separate boolean (not a status value) because the
-- project `status` column is auto-derived from stages/blockers by
-- syncProjectStatus and would clobber an "on_hold" status. The UI greys the
-- project + shows an "On Hold" badge when this is set, independent of status.
ALTER TABLE projects ADD COLUMN on_hold INTEGER NOT NULL DEFAULT 0;
