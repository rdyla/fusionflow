-- Append-only audit trail of mutating API requests.
--
-- Requested by Gary Conner via the roadmap table 2026-06-11 — "Would like to
-- see who is viewing or making changes as a log." Scoped to CHANGES; reads are
-- deliberately not logged (a single project page load fires many GETs and would
-- bury the change history).
--
-- Also closes security-audit P1 #4: admin impersonation was only written to
-- console.log, so it existed in Worker logs but was never queryable. Those now
-- land here as action='impersonate'.
--
-- Written by middleware at the /api/* choke point, so coverage is complete
-- across every route file rather than dependent on each handler remembering.
--
-- Actor name/email are DENORMALISED on purpose: an audit row must still say who
-- did something after that user is deleted, which a join to users cannot.
CREATE TABLE audit_log (
  id            TEXT PRIMARY KEY,
  -- What was touched. entity_type is 'project' for anything under
  -- /api/projects/:id; entity_id is that project's id. Both nullable so a
  -- mutation we can't attribute to a record is still recorded.
  entity_type   TEXT,
  entity_id     TEXT,
  -- 'create' | 'update' | 'delete' | 'impersonate', derived from HTTP method.
  action        TEXT NOT NULL,
  method        TEXT,
  path          TEXT,
  status        INTEGER,
  -- The effective user — who the request acted AS.
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_name    TEXT,
  actor_email   TEXT,
  -- Set ONLY when an admin was impersonating: the real admin behind the action.
  -- Null on ordinary requests. Without this an impersonated change would be
  -- attributed solely to the target user, which is the hole P1 #4 describes.
  on_behalf_of_email TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The project timeline read: newest first for one entity.
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id, created_at DESC);
-- Retention sweep (rows older than 365 days) and "what has this person done".
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_user_id, created_at DESC);
