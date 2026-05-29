-- The "Zoom AEs / Partner AEs" panel on the solution detail page reads
-- exclusively from solution_staff (staff_role='partner_ae'), but the
-- New Solution form's Vendor AE picker has been storing the chosen user
-- only in solutions.partner_ae_user_id since launch — never mirroring it
-- into solution_staff. Every pre-existing solution that picked a partner
-- AE at create time therefore shows "No partner AEs assigned" until the
-- SA manually re-adds them via the panel's + button.
--
-- POST /solutions now inserts the solution_staff row alongside the
-- solution row going forward. This one-shot backfill plugs the gap for
-- everything that landed before the fix. INSERT OR IGNORE so re-running
-- the migration (or solutions that already have a matching row) is safe.
--
-- INNER JOIN users serves two purposes:
--   1. implicit IS NOT NULL filter on partner_ae_user_id
--   2. skip orphan refs — prod had ≥1 solution whose partner_ae_user_id
--      points to a user row that was later deleted, which on the original
--      version of this migration tripped the FK constraint on
--      solution_staff.user_id and broke the entire deploy.
INSERT OR IGNORE INTO solution_staff (id, solution_id, user_id, staff_role, created_at)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
       lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
       lower(hex(randomblob(6))),
       s.id, s.partner_ae_user_id, 'partner_ae', CURRENT_TIMESTAMP
FROM solutions s
INNER JOIN users u ON u.id = s.partner_ae_user_id
LEFT JOIN solution_staff ss
  ON ss.solution_id = s.id
 AND ss.user_id = s.partner_ae_user_id
 AND ss.staff_role = 'partner_ae'
WHERE ss.id IS NULL;
