CREATE TABLE feature_requests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  priority TEXT NOT NULL DEFAULT 'medium',
  category TEXT,
  submitter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  admin_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE feature_request_votes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_request_id TEXT NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, feature_request_id)
);
