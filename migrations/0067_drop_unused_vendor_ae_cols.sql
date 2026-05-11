-- The vendor_ae_* columns on `solutions` were added in migration 0040 but the
-- "Vendor AE" UI in SolutionDetailPage actually writes to partner_ae_user_id /
-- partner_ae_name / partner_ae_email — vendor_ae_* is never read or written
-- by any code path. The leftover FK on vendor_ae_user_id (no ON DELETE clause)
-- silently blocks user deletes when stale data is sitting in those columns.
--
-- Dropping the dead columns removes the blocker and tidies the schema.

ALTER TABLE solutions DROP COLUMN vendor_ae_user_id;
ALTER TABLE solutions DROP COLUMN vendor_ae_name;
ALTER TABLE solutions DROP COLUMN vendor_ae_email;
