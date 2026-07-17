-- Per-folder AUDIENCE for SharePoint, generalizing the old binary
-- `visible_to_client` (0107) into a 4-way delineation:
--   'internal'                    — PF staff only (default; no row = this)
--   'internal_customer'           — + customer (client role)
--   'internal_partner'            — + partner (partner_ae role)
--   'internal_customer_partner'   — + both external audiences
-- `visible_to_client` is kept in sync (1 iff the audience includes customer) so
-- the existing "allow client editing implies visible" invariant and any legacy
-- readers keep working; /files read-filtering now keys on `audience`.
--
-- Backfill: existing shared folders were only ever seen by customers (partner_ae
-- was fully denied SharePoint), so they map to 'internal_customer' — no folder
-- silently becomes partner-visible.
ALTER TABLE sharepoint_folder_visibility ADD COLUMN audience TEXT NOT NULL DEFAULT 'internal';
UPDATE sharepoint_folder_visibility SET audience = 'internal_customer' WHERE visible_to_client = 1;
