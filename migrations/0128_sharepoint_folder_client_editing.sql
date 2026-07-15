-- Phase 2 of SharePoint guest editing: a per-folder "Allow client editing" flag,
-- distinct from visible_to_client (read). When on, the project's customer
-- contacts are granted edit access (and contacts added later are auto-granted).
-- Reuses the existing per-folder row keyed by sp_item_id.
ALTER TABLE sharepoint_folder_visibility ADD COLUMN client_editing INTEGER NOT NULL DEFAULT 0;
