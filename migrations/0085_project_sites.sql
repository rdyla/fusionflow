-- Multi-site deployments inside a single project.
--
-- For projects that roll out to multiple physical or organizational sites
-- on staggered timelines (e.g. City of Thousand Oaks: Libraries → Treatment
-- Plant → City Hall), each site gets its own go-live date and its own
-- per-site PMI phase chain (Plan / Execute / Monitor / Go-Live / Hypercare).
-- The project's Initiate phase stays shared across all sites.
--
-- Schema shape:
--   - sites: project-scoped, each with a name + target go-live + display order
--   - phases.site_id: nullable FK to sites. NULL = shared phase (Initiate);
--     non-NULL = phase belongs to that site's per-site chain.
--
-- Single-site projects (the vast majority) are unaffected: no rows in sites,
-- all phases keep site_id = NULL, and the Dashboard hides the Sites row.

CREATE TABLE sites (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_go_live_date TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sites_project_id ON sites(project_id);

ALTER TABLE phases ADD COLUMN site_id TEXT REFERENCES sites(id) ON DELETE CASCADE;

CREATE INDEX idx_phases_site_id ON phases(site_id);
