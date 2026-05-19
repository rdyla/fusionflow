-- Add per-phase working-days duration to templates.
--
-- Drives the new "Timeline Builder" tab on a project: PMs enter a target
-- go-live, the builder chains phases forward using WORKDAY math (Mon–Fri,
-- weekends skipped), and a single Apply commits phases + tasks to the
-- project with computed planned_start / planned_end dates.
--
-- Tasks inherit their phase's duration (matches the project-plan workbook
-- behavior where task End = WORKDAY(task Start, phase duration)).

ALTER TABLE template_phases ADD COLUMN working_days INTEGER NOT NULL DEFAULT 0;
