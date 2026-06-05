-- Shipment tracking: PMs add FedEx tracking numbers (largely drop-ships from
-- hardware vendors) + item names; a scheduled job pings the FedEx Track API and
-- caches the latest status here so the project Overview pane can render it.
CREATE TABLE project_shipments (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  carrier             TEXT NOT NULL DEFAULT 'fedex',
  tracking_number     TEXT NOT NULL,
  item_name           TEXT,
  status              TEXT,                 -- human-readable, e.g. "In transit"
  status_detail       TEXT,                 -- fuller description / latest scan
  estimated_delivery  TEXT,                 -- ISO date/datetime from carrier
  delivered           INTEGER NOT NULL DEFAULT 0,  -- 1 once delivered → polling stops
  last_checked_at     TEXT,                 -- when we last hit the carrier API
  created_by_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at          TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_project_shipments_project ON project_shipments(project_id);
-- Scheduled refresh scans for not-yet-delivered shipments.
CREATE INDEX idx_project_shipments_active ON project_shipments(delivered, last_checked_at);
