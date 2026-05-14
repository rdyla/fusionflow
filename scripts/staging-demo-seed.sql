-- ──────────────────────────────────────────────────────────────────────────
-- Staging "screen-grab" demo seed.
--
-- Wipes user-data tables (via the same wipe used by restore) and inserts a
-- small, screenshot-friendly fixture set across Customers, Solutions,
-- Projects (+ phases/tasks), and Optimize Accounts.
--
-- All fictional company names; all demo user emails end in @demo.example so
-- they can never collide with real OAuth identities. Demo user IDs are
-- prefixed `demo-fixture-` so the wipe step removes them cleanly without
-- touching real users.
--
-- Run via: npm run staging:demo-seed
-- Restore real data via: npm run staging:restore -- <snapshot.sql>
-- ──────────────────────────────────────────────────────────────────────────

-- ── 1. Wipe ───────────────────────────────────────────────────────────────
-- (Inlined from staging-wipe-data.sql so this seed is a single self-
-- contained file the user can run.)
DELETE FROM task_comments;
DELETE FROM task_time_entries;
DELETE FROM notes;
DELETE FROM documents;
DELETE FROM risks;
DELETE FROM zoom_recordings;
DELETE FROM notifications;
DELETE FROM meeting_prep_sends;
DELETE FROM labor_estimates;
DELETE FROM needs_assessments;
DELETE FROM impact_assessments;
DELETE FROM assessments;
DELETE FROM cs_versions;
DELETE FROM cs_proposals;
DELETE FROM project_contacts;
DELETE FROM project_staff;
DELETE FROM project_access;
DELETE FROM solution_contacts;
DELETE FROM solution_staff;
DELETE FROM customer_provider_aes;
DELETE FROM utilization_snapshots;
DELETE FROM account_tech_stack;
DELETE FROM optimize_accounts;
DELETE FROM tasks;
DELETE FROM phases;
DELETE FROM projects;
DELETE FROM solutions;
DELETE FROM customers;
DELETE FROM support_digests;
DELETE FROM prospect_contacts;
DELETE FROM prospects;
DELETE FROM prospect_lists;
DELETE FROM feature_request_votes;
DELETE FROM feature_requests;
DELETE FROM roadmap_items;
DELETE FROM users WHERE id LIKE 'demo-fixture-%';

-- ── 2. Demo fixture users ─────────────────────────────────────────────────
INSERT INTO users (id, email, name, organization_name, role, is_active) VALUES
  ('demo-fixture-pm-1',  'pat.wilson@demo.example',     'Pat Wilson',   'PacketFusion', 'pm',         1),
  ('demo-fixture-pm-2',  'jamie.carter@demo.example',   'Jamie Carter', 'PacketFusion', 'pm',         1),
  ('demo-fixture-ae-1',  'taylor.brooks@demo.example',  'Taylor Brooks','PacketFusion', 'pf_ae',      1),
  ('demo-fixture-sa-1',  'morgan.reed@demo.example',    'Morgan Reed',  'PacketFusion', 'pf_sa',      1);

-- ── 3. Customers ──────────────────────────────────────────────────────────
INSERT INTO customers (id, name, crm_account_id) VALUES
  ('demo-cust-acme',     'Acme Corporation',       'demo-crm-acme'),
  ('demo-cust-globex',   'Globex Industries',      'demo-crm-globex'),
  ('demo-cust-hooli',    'Hooli, Inc.',            'demo-crm-hooli'),
  ('demo-cust-initech',  'Initech Systems',        'demo-crm-initech');

-- ── 4. Solutions (variety of vendors + statuses) ──────────────────────────
INSERT INTO solutions (id, name, customer_name, customer_id, vendor, solution_types, other_technologies, status, blended_rate, pricing_mode, add_ons)
VALUES
  ('demo-sol-1', 'Globex Industries – Zoom UCaaS',         'Globex Industries', 'demo-cust-globex',  'zoom',           '["ucaas"]',         '[]', 'scope',        165, 'basic',    '[]'),
  ('demo-sol-2', 'Hooli, Inc. – RingCentral CCaaS',        'Hooli, Inc.',       'demo-cust-hooli',   'ringcentral',    '["ccaas"]',         '[]', 'requirements', 165, 'advanced', '[]'),
  ('demo-sol-3', 'Initech Systems – Webex UCaaS+CCaaS',    'Initech Systems',   'demo-cust-initech', 'webex',          '["ucaas","ccaas"]', '[]', 'assessment',   165, 'advanced', '[]'),
  ('demo-sol-4', 'Acme Corporation – Microsoft Teams',     'Acme Corporation',  'demo-cust-acme',    'microsoft_teams','["ucaas"]',         '[]', 'handoff',      165, 'tiered',   '[]');

-- ── 5. Projects (different phases / health) ───────────────────────────────
INSERT INTO projects (id, name, customer_name, customer_id, vendor, solution_types, status, health, kickoff_date, target_go_live_date, pm_user_id)
VALUES
  ('demo-proj-1', 'Acme Corporation – Zoom Phone Rollout',        'Acme Corporation',  'demo-cust-acme',    'zoom',         '["ucaas"]',         'in_progress', 'on_track', '2026-03-01', '2026-06-15', 'demo-fixture-pm-1'),
  ('demo-proj-2', 'Globex Industries – RingCentral Migration',    'Globex Industries', 'demo-cust-globex',  'ringcentral',  '["ucaas","ccaas"]', 'in_progress', 'at_risk',  '2026-02-10', '2026-05-30', 'demo-fixture-pm-2'),
  ('demo-proj-3', 'Hooli, Inc. – Webex Contact Center',           'Hooli, Inc.',       'demo-cust-hooli',   'webex',        '["ccaas"]',         'in_progress', 'on_track', '2026-04-01', '2026-07-20', 'demo-fixture-pm-1');

-- ── 6. Phases for each project (8-phase standard plan) ────────────────────
-- demo-proj-1 (Acme/Zoom) — mid-flight, design phase active
INSERT INTO phases (id, project_id, name, sort_order, planned_start, planned_end, actual_start, actual_end, status) VALUES
  ('demo-ph-1-1', 'demo-proj-1', 'Sales Handoff',                     1, '2026-03-01', '2026-03-08', '2026-03-01', '2026-03-07', 'completed'),
  ('demo-ph-1-2', 'demo-proj-1', 'Discovery / Requirements',          2, '2026-03-08', '2026-03-22', '2026-03-08', '2026-03-21', 'completed'),
  ('demo-ph-1-3', 'demo-proj-1', 'Design',                            3, '2026-03-22', '2026-04-12', '2026-03-22', NULL,         'in_progress'),
  ('demo-ph-1-4', 'demo-proj-1', 'Provisioning / Configuration',      4, '2026-04-12', '2026-05-10', NULL, NULL, 'not_started'),
  ('demo-ph-1-5', 'demo-proj-1', 'Testing / UAT',                     5, '2026-05-10', '2026-05-31', NULL, NULL, 'not_started'),
  ('demo-ph-1-6', 'demo-proj-1', 'Training / Enablement',             6, '2026-05-31', '2026-06-08', NULL, NULL, 'not_started'),
  ('demo-ph-1-7', 'demo-proj-1', 'Porting / Go-Live',                 7, '2026-06-08', '2026-06-15', NULL, NULL, 'not_started'),
  ('demo-ph-1-8', 'demo-proj-1', 'Hypercare',                         8, '2026-06-15', '2026-06-30', NULL, NULL, 'not_started');

-- demo-proj-2 (Globex/RingCentral) — later in flight, testing phase
INSERT INTO phases (id, project_id, name, sort_order, planned_start, planned_end, actual_start, actual_end, status) VALUES
  ('demo-ph-2-1', 'demo-proj-2', 'Sales Handoff',                     1, '2026-02-10', '2026-02-17', '2026-02-10', '2026-02-16', 'completed'),
  ('demo-ph-2-2', 'demo-proj-2', 'Discovery / Requirements',          2, '2026-02-17', '2026-03-03', '2026-02-17', '2026-03-02', 'completed'),
  ('demo-ph-2-3', 'demo-proj-2', 'Design',                            3, '2026-03-03', '2026-03-24', '2026-03-03', '2026-03-25', 'completed'),
  ('demo-ph-2-4', 'demo-proj-2', 'Provisioning / Configuration',      4, '2026-03-24', '2026-04-21', '2026-03-24', '2026-04-25', 'completed'),
  ('demo-ph-2-5', 'demo-proj-2', 'Testing / UAT',                     5, '2026-04-21', '2026-05-12', '2026-04-25', NULL,         'in_progress'),
  ('demo-ph-2-6', 'demo-proj-2', 'Training / Enablement',             6, '2026-05-12', '2026-05-22', NULL, NULL, 'not_started'),
  ('demo-ph-2-7', 'demo-proj-2', 'Porting / Go-Live',                 7, '2026-05-22', '2026-05-30', NULL, NULL, 'not_started'),
  ('demo-ph-2-8', 'demo-proj-2', 'Hypercare',                         8, '2026-05-30', '2026-06-14', NULL, NULL, 'not_started');

-- demo-proj-3 (Hooli/Webex) — early stage, discovery active
INSERT INTO phases (id, project_id, name, sort_order, planned_start, planned_end, actual_start, actual_end, status) VALUES
  ('demo-ph-3-1', 'demo-proj-3', 'Sales Handoff',                     1, '2026-04-01', '2026-04-08', '2026-04-01', '2026-04-07', 'completed'),
  ('demo-ph-3-2', 'demo-proj-3', 'Discovery / Requirements',          2, '2026-04-08', '2026-04-29', '2026-04-08', NULL,         'in_progress'),
  ('demo-ph-3-3', 'demo-proj-3', 'Design',                            3, '2026-04-29', '2026-05-20', NULL, NULL, 'not_started'),
  ('demo-ph-3-4', 'demo-proj-3', 'Provisioning / Configuration',      4, '2026-05-20', '2026-06-17', NULL, NULL, 'not_started'),
  ('demo-ph-3-5', 'demo-proj-3', 'Testing / UAT',                     5, '2026-06-17', '2026-07-08', NULL, NULL, 'not_started'),
  ('demo-ph-3-6', 'demo-proj-3', 'Training / Enablement',             6, '2026-07-08', '2026-07-15', NULL, NULL, 'not_started'),
  ('demo-ph-3-7', 'demo-proj-3', 'Porting / Go-Live',                 7, '2026-07-15', '2026-07-20', NULL, NULL, 'not_started'),
  ('demo-ph-3-8', 'demo-proj-3', 'Hypercare',                         8, '2026-07-20', '2026-08-04', NULL, NULL, 'not_started');

-- ── 7. A small sample of tasks across the active phases ───────────────────
INSERT INTO tasks (id, project_id, phase_id, title, assignee_user_id, due_date, status, priority) VALUES
  ('demo-tk-1', 'demo-proj-1', 'demo-ph-1-3', 'Confirm site list and dial plan',           'demo-fixture-pm-1', '2026-04-05', 'in_progress', 'high'),
  ('demo-tk-2', 'demo-proj-1', 'demo-ph-1-3', 'Document number porting requirements',      'demo-fixture-pm-1', '2026-04-08', 'not_started', 'normal'),
  ('demo-tk-3', 'demo-proj-1', 'demo-ph-1-4', 'Provision Zoom Phone tenant',               'demo-fixture-sa-1', '2026-04-19', 'not_started', 'normal'),
  ('demo-tk-4', 'demo-proj-2', 'demo-ph-2-5', 'Conduct end-user UAT sessions',             'demo-fixture-pm-2', '2026-05-05', 'in_progress', 'high'),
  ('demo-tk-5', 'demo-proj-2', 'demo-ph-2-5', 'Validate call routing and queue behavior',  'demo-fixture-sa-1', '2026-05-08', 'in_progress', 'high'),
  ('demo-tk-6', 'demo-proj-2', 'demo-ph-2-7', 'Submit LOA for number porting',             'demo-fixture-pm-2', '2026-05-18', 'not_started', 'high'),
  ('demo-tk-7', 'demo-proj-3', 'demo-ph-3-2', 'Capture call-flow inventory',               'demo-fixture-pm-1', '2026-04-22', 'in_progress', 'normal'),
  ('demo-tk-8', 'demo-proj-3', 'demo-ph-3-2', 'Define agent skills + queue mapping',       'demo-fixture-sa-1', '2026-04-26', 'not_started', 'normal');

-- ── 8. A couple of risks (so the Blockers tab isn't empty) ────────────────
INSERT INTO risks (id, project_id, title, description, severity, status, owner_user_id)
VALUES
  ('demo-rk-1', 'demo-proj-2', 'Carrier LOA delay risk',     'Awaiting carrier confirmation on FOC date for primary site.',           'high',   'open', 'demo-fixture-pm-2'),
  ('demo-rk-2', 'demo-proj-2', 'UAT resourcing constraint',  'Customer power-user cohort smaller than recommended; may extend UAT.',  'medium', 'open', 'demo-fixture-pm-2');

-- ── 9. Optimize accounts (post go-live) ───────────────────────────────────
-- These need a project to graduate from; create one already-completed
-- project for each demo optimize account.
INSERT INTO projects (id, name, customer_name, customer_id, vendor, solution_types, status, health, kickoff_date, target_go_live_date, actual_go_live_date, pm_user_id) VALUES
  ('demo-proj-opt-1', 'Initech Systems – Zoom Phone (Live)',         'Initech Systems', 'demo-cust-initech', 'zoom',        '["ucaas"]', 'complete', 'on_track', '2025-11-01', '2026-02-15', '2026-02-14', 'demo-fixture-pm-1'),
  ('demo-proj-opt-2', 'Acme Corporation – RingCentral CCaaS (Live)', 'Acme Corporation','demo-cust-acme',    'ringcentral', '["ccaas"]', 'complete', 'on_track', '2025-10-15', '2026-01-30', '2026-01-29', 'demo-fixture-pm-2');

INSERT INTO optimize_accounts (id, project_id, customer_id, graduated_at, graduation_method, optimize_status, next_review_date, notes)
VALUES
  ('demo-opt-1', 'demo-proj-opt-1', 'demo-cust-initech', '2026-02-14', 'auto',   'active', '2026-05-14', 'Steady-state adoption; review usage in 90 days.'),
  ('demo-opt-2', 'demo-proj-opt-2', 'demo-cust-acme',    '2026-01-29', 'manual', 'active', '2026-04-29', 'Expansion opportunity flagged — additional 200 agents pending.');
