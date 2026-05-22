-- Seed working_days for the RingCentral templates and rename
-- "RingCentral Engage" → "RingCX" (the current product name).
--
-- Per @rdyla: assume the same working_days as the Zoom counterparts.
-- RingCentral templates were canonicalized in migration 0073 but only have
-- 6 phases (no Closing); we seed the 6 that exist and skip Closing.
--
--   tmpl-ucaas-rc  ↔ tmpl-ucaas-zoom values (Initiation 5, Planning 15,
--                   Executing 10, Monitoring 10, Go Live 7, Hypercare 10)
--   tmpl-ccaas-rce ↔ tmpl-ccaas-zcc values  (Initiation 4, Planning 20,
--                   Executing 20, Monitoring 10, Go Live 2, Hypercare 10)

-- ── RingCentral UCaaS ────────────────────────────────────────────────────
UPDATE template_phases SET working_days = 5  WHERE id = 'tph-urc-init';
UPDATE template_phases SET working_days = 15 WHERE id = 'tph-urc-plan';
UPDATE template_phases SET working_days = 10 WHERE id = 'tph-urc-exec';
UPDATE template_phases SET working_days = 10 WHERE id = 'tph-urc-moni';
UPDATE template_phases SET working_days = 7  WHERE id = 'tph-urc-gl';
UPDATE template_phases SET working_days = 10 WHERE id = 'tph-urc-hc';

-- ── RingCentral CCaaS (RingCX) ───────────────────────────────────────────
UPDATE template_phases SET working_days = 4  WHERE id = 'tph-rce-init';
UPDATE template_phases SET working_days = 20 WHERE id = 'tph-rce-plan';
UPDATE template_phases SET working_days = 20 WHERE id = 'tph-rce-exec';
UPDATE template_phases SET working_days = 10 WHERE id = 'tph-rce-moni';
UPDATE template_phases SET working_days = 2  WHERE id = 'tph-rce-gl';
UPDATE template_phases SET working_days = 10 WHERE id = 'tph-rce-hc';

-- Rebrand: RingCentral Engage → RingCX. Template id stays unchanged.
UPDATE templates
   SET name = 'CCaaS - RingCX',
       description = 'RingCX (formerly RingCentral Engage) CCaaS implementation'
 WHERE id = 'tmpl-ccaas-rce';
