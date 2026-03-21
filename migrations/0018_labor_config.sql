CREATE TABLE IF NOT EXISTS labor_config (
  category    TEXT PRIMARY KEY,
  base_hours  TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
