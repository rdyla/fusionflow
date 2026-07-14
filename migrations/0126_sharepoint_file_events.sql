-- Append-only history of SharePoint file uploads/replaces made THROUGH the app.
--
-- Graph runs app-only, so its createdBy/lastModifiedBy is always the app
-- principal — we can't learn who changed a file from Graph. But every upload or
-- "upload new version" that flows through CloudConnect is authenticated, so we
-- know the real user. This table records one row per such event, giving a
-- reliable "who changed this, and when" timeline per file.
--
-- Distinct from sharepoint_uploads (which upserts the LATEST uploader for the
-- file-list attribution overlay). This one is additive and never updated in
-- place — it's the history.
CREATE TABLE sharepoint_file_events (
  id             TEXT PRIMARY KEY,
  sp_item_id     TEXT NOT NULL,                                   -- Graph driveItem id (join key to the file)
  project_id     TEXT REFERENCES projects(id) ON DELETE CASCADE,
  web_url        TEXT,
  filename       TEXT,
  action         TEXT NOT NULL DEFAULT 'upload',                  -- 'upload' (first) | 'replace' (new version)
  size           INTEGER,
  actor_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_name     TEXT,
  actor_email    TEXT,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sp_file_events_item ON sharepoint_file_events(sp_item_id, created_at);

-- Backfill: seed one 'upload' event per already-shadowed upload so history isn't
-- empty for files uploaded before this feature. INNER JOIN projects keeps it
-- orphan-safe (skip any attribution rows whose project was since deleted).
INSERT INTO sharepoint_file_events
  (id, sp_item_id, project_id, web_url, filename, action, actor_user_id, actor_name, actor_email, created_at)
SELECT lower(hex(randomblob(16))), u.sp_item_id, u.project_id, u.web_url, NULL, 'upload',
       u.uploaded_by_user_id, u.uploaded_by_name, u.uploaded_by_email, u.uploaded_at
FROM sharepoint_uploads u
INNER JOIN projects p ON p.id = u.project_id;
