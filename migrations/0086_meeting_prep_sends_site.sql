-- Per-site meeting prep for multi-site projects.
--
-- For UAT and go_live emails on a project with deployment sites, each
-- send is scoped to a specific site (Libraries UAT vs Treatment UAT vs
-- HQ UAT — distinct meetings with distinct prep). Kickoff / Discovery /
-- Design Review stay project-wide; their site_id stays NULL.
--
-- Single-site projects (no rows in `sites`) are unaffected: site_id is
-- always NULL, history renders exactly as it does today.

ALTER TABLE meeting_prep_sends ADD COLUMN site_id TEXT REFERENCES sites(id) ON DELETE SET NULL;

CREATE INDEX idx_meeting_prep_sends_site
  ON meeting_prep_sends(site_id, meeting_type, sent_at DESC);
