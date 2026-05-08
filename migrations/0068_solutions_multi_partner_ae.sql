-- Mirror the projects pattern: solutions support multiple Partner AEs via the
-- existing `solution_staff` table (staff_role='partner_ae'). Backfill any
-- existing solution.partner_ae_user_id into solution_staff so the new chip UI
-- starts with the same data the legacy single field had.
--
-- The legacy partner_ae_user_id / partner_ae_name / partner_ae_email columns
-- are kept in place for now (still read by the list view and ProjectHandoff
-- doc); a future cleanup can drop them once all read paths are migrated.

INSERT OR IGNORE INTO solution_staff (id, solution_id, user_id, staff_role)
SELECT
  lower(hex(randomblob(16))),
  id,
  partner_ae_user_id,
  'partner_ae'
FROM solutions
WHERE partner_ae_user_id IS NOT NULL;
