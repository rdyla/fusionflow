-- ──────────────────────────────────────────────────────────────────────────
-- Heavy wipe — used only by scripts/staging-restore.mjs.
--
-- A restore replays a snapshot that contains rows for every table we
-- dumped, including users / templates / app_settings / labor_config. If
-- we leave any of those in place, the snapshot INSERTs collide on PRIMARY
-- KEY / UNIQUE constraints. So this wipe is intentionally aggressive:
-- everything gets cleared and the snapshot rebuilds it.
--
-- Tables intentionally LEFT ALONE:
--   * d1_migrations / sqlite_* / _cf_* — D1 internals (snapshot also
--     filters these via staging-restore.mjs so they never get replayed).
--
-- The demo-seed flow uses a different, lighter wipe inlined at the top
-- of staging-demo-seed.sql which preserves real OAuth users.
--
-- Order respects FK references (children before parents).
-- ──────────────────────────────────────────────────────────────────────────

-- Leaf records that point at tasks/phases/projects/solutions
DELETE FROM task_comments;
DELETE FROM task_time_entries;
DELETE FROM notes;
DELETE FROM documents;
DELETE FROM risks;
DELETE FROM zoom_recordings;
DELETE FROM notifications;
DELETE FROM meeting_prep_sends;

-- Per-type rows for solutioning
DELETE FROM labor_estimates;
DELETE FROM needs_assessments;
DELETE FROM impact_assessments;
DELETE FROM assessments;
DELETE FROM cs_versions;
DELETE FROM cs_proposals;

-- Project + solution junction tables
DELETE FROM project_contacts;
DELETE FROM project_staff;
DELETE FROM project_access;
DELETE FROM solution_contacts;
DELETE FROM solution_staff;
DELETE FROM customer_provider_aes;

-- Optimize-side data
DELETE FROM utilization_snapshots;
DELETE FROM account_tech_stack;
DELETE FROM optimize_accounts;

-- Core records
DELETE FROM tasks;
DELETE FROM phases;
DELETE FROM projects;
DELETE FROM solutions;
DELETE FROM customers;

-- Misc visible data
DELETE FROM support_digests;
DELETE FROM prospect_contacts;
DELETE FROM prospects;
DELETE FROM prospect_lists;
DELETE FROM feature_request_votes;
DELETE FROM feature_requests;
DELETE FROM roadmap_items;

-- Templates (config — repopulated from snapshot)
DELETE FROM template_tasks;
DELETE FROM template_phases;
DELETE FROM templates;

-- App-level config (repopulated from snapshot)
DELETE FROM app_settings;
DELETE FROM labor_config;

-- All users (real OAuth identities are repopulated from snapshot)
DELETE FROM users;
