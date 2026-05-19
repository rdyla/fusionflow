-- Seed working_days for the Zoom Phone template (tmpl-ucaas-zoom).
--
-- Values mirror the "Duration (Workdays)" column in the ZP project plan
-- workbook PMs already use. The workbook also lists sub-phases (Assessment
-- & Design, Emergency Service, etc.) with their own durations — those live
-- in our DB as tasks under each top-level phase, so we only seed the seven
-- top-level phase durations here.
--
-- Phase totals (Initiation 5 + Planning 15 + Executing 10 + Monitoring 10
-- + Go Live 7 + Closing 1 = 48 workdays pre-go-live, then Hypercare 10
-- post-go-live).

UPDATE template_phases SET working_days = 5  WHERE id = 'tph-uzoom-init';
UPDATE template_phases SET working_days = 15 WHERE id = 'tph-uzoom-plan';
UPDATE template_phases SET working_days = 10 WHERE id = 'tph-uzoom-exec';
UPDATE template_phases SET working_days = 10 WHERE id = 'tph-uzoom-moni';
UPDATE template_phases SET working_days = 7  WHERE id = 'tph-uzoom-gl';
UPDATE template_phases SET working_days = 1  WHERE id = 'tph-uzoom-cls';
UPDATE template_phases SET working_days = 10 WHERE id = 'tph-uzoom-hc';
