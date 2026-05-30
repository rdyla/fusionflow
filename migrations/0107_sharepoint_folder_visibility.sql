-- Per-folder client/partner visibility for SharePoint folders.
--
-- Folders live in SharePoint (Graph); this table is the app-side overlay that
-- records which folders a PM has shared with the customer-facing roles
-- (client / partner_ae). A folder is visible to those roles ONLY when a row
-- here has visible_to_client = 1 — default (no row) is hidden/internal.
--
-- Keyed by the folder's Graph driveItem id (sp_item_id). web_url is stored too
-- so the /files endpoint can look up the CURRENTLY-listed folder's own flag
-- (to decide whether loose files in it are shown to client/partner).

CREATE TABLE sharepoint_folder_visibility (
  sp_item_id TEXT PRIMARY KEY,
  project_id TEXT,
  web_url TEXT,
  visible_to_client INTEGER NOT NULL DEFAULT 0,
  set_by_user_id TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_spfv_web_url ON sharepoint_folder_visibility (web_url);
CREATE INDEX idx_spfv_project ON sharepoint_folder_visibility (project_id);
