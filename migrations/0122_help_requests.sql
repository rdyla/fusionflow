-- Contextual-help support requests. A user who can't find what they need in
-- the in-app help popover files a request here. Local-only entity (no Dynamics
-- incident) so CloudConnect admins get immediate in-app + email notification on
-- create — see routes/helpRequests.ts. Distinct from CRM support cases, which
-- are customer telecom service incidents on the Dynamics support board.
--
--   status:  open (default) -> in_progress -> resolved | closed
--   module/page_path: where the user was when they asked (for context + triage)
CREATE TABLE IF NOT EXISTS help_requests (
  id TEXT PRIMARY KEY,
  requester_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  module TEXT,                 -- top-level section, e.g. "projects", "support"
  page_path TEXT,              -- full route path the request was filed from
  subject TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  admin_notes TEXT,
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_help_requests_status ON help_requests(status);
CREATE INDEX IF NOT EXISTS idx_help_requests_requester ON help_requests(requester_id);
