CREATE TABLE task_comments (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_task_comments_task_id ON task_comments(task_id);
