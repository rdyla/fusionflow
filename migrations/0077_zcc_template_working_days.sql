-- Seed working_days for the Zoom Contact Center template (tmpl-ccaas-zcc).
--
-- The PM workbook for ZCC uses implementation-stage names (Assessment and
-- Design, Build and Test, etc.) while our DB stores the PMI-canonical names
-- (Planning, Executing, etc.). Mapping:
--
--   workbook name           DB phase name            workdays  source
--   ───────────────────────────────────────────────────────────────────────────
--   Initiation              Initiation               4         workbook
--   Assessment and Design   Planning                 20        sub-phase sum
--                                                              (current state 10
--                                                              + design 5 + data
--                                                              prep 5)
--   Build and Test          Executing                20        4 weeks of
--                                                              business days
--                                                              (the workbook's
--                                                              "100" was a typo;
--                                                              4 wks is the
--                                                              actual budget)
--   Prep for Cutover        Monitoring/Controlling   10        workbook
--   Go Live                 Go Live / Production     2         workbook
--   Post Go Live            Hypercare                10        workbook
--   Project Closure         Closing                  3         workbook
--
-- 59 workdays pre-go-live + 10 hypercare post-go-live (12 weeks pre + 2 weeks
-- post).

UPDATE template_phases SET working_days = 4   WHERE id = 'tph-czcc-init';
UPDATE template_phases SET working_days = 20  WHERE id = 'tph-czcc-plan';
UPDATE template_phases SET working_days = 20  WHERE id = 'tph-czcc-exec';
UPDATE template_phases SET working_days = 10  WHERE id = 'tph-czcc-moni';
UPDATE template_phases SET working_days = 2   WHERE id = 'tph-czcc-gl';
UPDATE template_phases SET working_days = 3   WHERE id = 'tph-czcc-cls';
UPDATE template_phases SET working_days = 10  WHERE id = 'tph-czcc-hc';
