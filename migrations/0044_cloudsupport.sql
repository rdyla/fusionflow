-- Cloud Support Calculator proposals and version history
CREATE TABLE cs_proposals (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  creator_id  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE cs_versions (
  id          TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES cs_proposals(id) ON DELETE CASCADE,
  version_num INTEGER NOT NULL,
  label       TEXT,
  form_data   TEXT NOT NULL,  -- JSON: OppFormData
  calc_result TEXT NOT NULL,  -- JSON: OppCalcResult snapshot
  created_by_id TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
