-- History of support digest emails sent to customers. One row per send.
-- account_id is the D365 account GUID (incidents live in D365, not D1, so we
-- can't FK to a local table). Counts are snapshotted at send-time so we can
-- show the supervisor what numbers were communicated, even if the case data
-- changes later.
CREATE TABLE IF NOT EXISTS support_digests (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  account_name TEXT,
  recipients TEXT NOT NULL,                -- JSON: [{ name, email }]
  sent_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  sent_by_name TEXT,
  sent_by_email TEXT,
  open_cases_count     INTEGER NOT NULL DEFAULT 0,
  resolved_cases_count INTEGER NOT NULL DEFAULT 0,
  stale_cases_count    INTEGER NOT NULL DEFAULT 0,
  stuck_cases_count    INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_digests_account_id ON support_digests(account_id);
CREATE INDEX IF NOT EXISTS idx_support_digests_sent_at    ON support_digests(sent_at DESC);
