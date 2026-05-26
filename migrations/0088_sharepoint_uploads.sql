-- Per-file upload attribution for the SharePoint tab.
--
-- Microsoft Graph runs as app-only auth (no per-user delegated OAuth), so
-- the createdBy / lastModifiedBy fields on SP driveItems always show the
-- app's principal — "FusionFlow" / "SharePoint App" — regardless of which
-- person actually clicked Upload. To attribute uploads to real users, we
-- shadow each upload with a row here: the SP item id is the join key, the
-- name + email snapshot is the durable display.
--
-- Files uploaded via the SP web UI directly (bypassing our portal) have
-- no row here — the file list falls back to the Graph identity for those,
-- which is the right behavior since we genuinely don't know who touched
-- them in that case.

CREATE TABLE sharepoint_uploads (
  sp_item_id          TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  web_url             TEXT,
  uploaded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by_name    TEXT,
  uploaded_by_email   TEXT,
  uploaded_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sharepoint_uploads_project ON sharepoint_uploads(project_id);
