-- Tracks which external people have been granted edit access to a SharePoint
-- folder through the app (the "customer online editing" flow). The actual write
-- permission lives in SharePoint; this table is our record of it so we can:
--   1. show the granted customer an in-portal "Edit online" link, and
--   2. show PMs who currently has edit access (and later, revoke it).
--
-- Grants are folder-level and cascade to children (matches SharePoint's own
-- behavior), so a file is editable-online when it sits under any granted folder.
CREATE TABLE sharepoint_edit_grants (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  web_url            TEXT NOT NULL,           -- the granted folder's URL (prefix-matched against child items)
  grantee_email      TEXT NOT NULL,
  grantee_name       TEXT,
  granted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  granted_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Overlay lookup keys on the grantee's email (external viewer) and on project.
CREATE INDEX idx_sp_edit_grants_email   ON sharepoint_edit_grants(grantee_email);
CREATE INDEX idx_sp_edit_grants_project ON sharepoint_edit_grants(project_id);
