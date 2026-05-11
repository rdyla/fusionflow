-- Mirror the projects pattern: solutions support multiple Partner AEs via the
-- existing `solution_staff` table (staff_role='partner_ae'). Backfill any
-- existing solution.partner_ae_user_id into solution_staff so the new chip UI
-- starts with the same data the legacy single field had.
--
-- The legacy partner_ae_user_id / partner_ae_name / partner_ae_email columns
-- are kept in place for now (still read by the list view and ProjectHandoff
-- doc); a future cleanup can drop them once all read paths are migrated.
--
-- `INSERT OR IGNORE` skips UNIQUE-constraint collisions but does NOT skip
-- FK-constraint failures. Prod hit `SQLITE_CONSTRAINT_FOREIGNKEY` on the
-- original version of this migration because at least one solution had a
-- partner_ae_user_id pointing to a user row that no longer existed (orphan
-- ref left over from a deleted user). Filter those out — solution_staff
-- requires a valid users.id and we won't fabricate the missing user just
-- to back-fill a stale reference.

INSERT OR IGNORE INTO solution_staff (id, solution_id, user_id, staff_role)
SELECT
  lower(hex(randomblob(16))),
  s.id,
  s.partner_ae_user_id,
  'partner_ae'
FROM solutions s
WHERE s.partner_ae_user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = s.partner_ae_user_id);
