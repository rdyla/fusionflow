-- Claude connector: logging time.
--
-- Pay codes are employee-specific (HR-EXM for salaried staff, etc.) and come
-- from one global Dynamics list, so a per-user default is just the amc_paycode
-- GUID. Set in Admin → Users. When unset, the connector falls back to the pay
-- code the user last logged with.
ALTER TABLE users ADD COLUMN default_pay_code_id TEXT;

-- Duplicate guard for create_time_entry. A connector retry (timeout, network
-- blip, the model calling twice) must never post the same billable time twice.
--
-- One row per logical request, claimed BEFORE the Dynamics call; the UNIQUE
-- key is what makes two concurrent calls race to exactly one winner. The key is
-- the caller's idempotency_key when given, else derived from the entry itself
-- (user + project + stage + start + end), so an identical retry collides even
-- if the client sent no key.
--
--   pending — claimed, CRM call in flight (or the worker died mid-call)
--   done    — entry created; result_json is replayed to any retry
--   failed  — CRM rejected it; a retry may reclaim the row
--
-- entry_id points at the local time entry a 'done' request created. A replay
-- first checks it still exists with the same times; if it was deleted or
-- edited since (from the UI or the connector), the request is reclaimed and
-- logged fresh instead of answering with a stale result.
CREATE TABLE mcp_time_requests (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_key     TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending', 'done', 'failed')),
  entry_id        TEXT,
  result_json     TEXT,
  error           TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, request_key)
);
