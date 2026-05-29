-- Seed working_days for the Zoom Revenue Accelerator template (tmpl-zoom-ra).
--
-- This was the one template never given durations: the column was added with
-- DEFAULT 0 in 0075, and every later seeding migration (0076 Zoom Phone, 0077
-- ZCC, 0079 VA, 0080 WFM/QM, 0083 RingCentral) skipped it. Result: all its
-- stages sat at working_days = 0, so the Timeline Builder + quick-apply path
-- (templates.ts) computed workdaysThroughAnchor = 0 and silently applied tasks
-- with no dates even when a target go-live was supplied.
--
-- Per @rdyla: mirror the Zoom Phone (tmpl-ucaas-zoom) values. ZRA was
-- canonicalized in 0073 with only 5 stages (no Monitoring, no Closing), so we
-- seed the 5 that exist.
--
-- NOTE: template_phases was renamed to template_stages in migration 0092;
-- this migration runs after, so it targets template_stages. The tph-zra-*
-- ids are unchanged by that rename.

UPDATE template_stages SET working_days = 5  WHERE id = 'tph-zra-init';
UPDATE template_stages SET working_days = 15 WHERE id = 'tph-zra-plan';
UPDATE template_stages SET working_days = 10 WHERE id = 'tph-zra-exec';
UPDATE template_stages SET working_days = 7  WHERE id = 'tph-zra-gl';
UPDATE template_stages SET working_days = 10 WHERE id = 'tph-zra-hc';
