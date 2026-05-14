-- ──────────────────────────────────────────────────────────────────────────
-- Wipe all user-data tables on staging.
--
-- Used as the first step of both:
--   * staging-demo-seed.sql        (then inserts clean demo records)
--   * scripts/staging-restore.mjs  (then replays a snapshot file)
--
-- Intentionally LEAVES IN PLACE:
--   * users               — real OAuth identities
--   * templates / template_phases / template_tasks — config
--   * app_settings, labor_config — config
--   * _cf_KV / _d1_migrations    — D1 internals
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

-- Demo fixture users only — real OAuth identities (UUID ids) are preserved.
DELETE FROM users WHERE id LIKE 'demo-fixture-%';
