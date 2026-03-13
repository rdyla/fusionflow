-- ──────────────────────────────────────────────────────────────────────────
-- FusionFlow Seed Data
-- ──────────────────────────────────────────────────────────────────────────

-- USERS
INSERT INTO users (id, email, name, organization_name, role, is_active) VALUES
  ('u-admin-001', 'admin@packetfusion.com',   'Alex Rivera',    'PacketFusion',  'admin',      1),
  ('u-pm-001',    'pm@packetfusion.com',       'Jordan Lee',     'PacketFusion',  'pm',         1),
  ('u-ae-001',    'ae@packetfusion.com',        'Morgan Blake',   'PacketFusion',  'pf_ae',      1),
  ('u-par-001',   'partner@cisco.com',          'Casey Nguyen',   'Cisco',         'partner_ae', 1),
  ('u-par-002',   'partner@zoom.com',           'Taylor Okafor',  'Zoom',          'partner_ae', 1);

-- ──────────────────────────────────────────────────────────────────────────
-- PROJECT 1: Acme Corp – Webex Calling  (in_progress / on_track)
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO projects (id, name, customer_name, vendor, solution_type, status, health,
  kickoff_date, target_go_live_date, actual_go_live_date, pm_user_id, ae_user_id) VALUES
  ('p-001', 'Acme Corp – Webex Calling', 'Acme Corp', 'Cisco', 'UCaaS',
   'in_progress', 'on_track',
   '2026-01-15', '2026-04-30', NULL,
   'u-pm-001', 'u-ae-001');

-- Phases for p-001
INSERT INTO phases (id, project_id, name, sort_order, planned_start, planned_end, actual_start, actual_end, status) VALUES
  ('ph-001-1', 'p-001', 'Sales Handoff',                        1, '2026-01-15', '2026-01-20', '2026-01-15', '2026-01-19', 'completed'),
  ('ph-001-2', 'p-001', 'Discovery / Requirements',             2, '2026-01-20', '2026-02-03', '2026-01-20', '2026-02-01', 'completed'),
  ('ph-001-3', 'p-001', 'Design',                               3, '2026-02-03', '2026-02-17', '2026-02-03', NULL,         'in_progress'),
  ('ph-001-4', 'p-001', 'Provisioning / Configuration / Integration', 4, '2026-02-17', '2026-03-17', NULL, NULL, 'not_started'),
  ('ph-001-5', 'p-001', 'Testing / UAT',                        5, '2026-03-17', '2026-04-07', NULL, NULL, 'not_started'),
  ('ph-001-6', 'p-001', 'Training / Enablement',                6, '2026-04-07', '2026-04-21', NULL, NULL, 'not_started'),
  ('ph-001-7', 'p-001', 'Porting / Go-Live',                    7, '2026-04-21', '2026-04-30', NULL, NULL, 'not_started'),
  ('ph-001-8', 'p-001', 'Hypercare',                            8, '2026-04-30', '2026-05-14', NULL, NULL, 'not_started'),
  ('ph-001-9', 'p-001', 'Closed',                               9, '2026-05-14', '2026-05-14', NULL, NULL, 'not_started');

-- Milestones for p-001
INSERT INTO milestones (id, project_id, phase_id, name, target_date, actual_date, status) VALUES
  ('ms-001-1', 'p-001', 'ph-001-2', 'Requirements Doc Approved',     '2026-02-01', '2026-02-01', 'completed'),
  ('ms-001-2', 'p-001', 'ph-001-3', 'Solution Design Signed Off',    '2026-02-17', NULL,          'in_progress'),
  ('ms-001-3', 'p-001', 'ph-001-5', 'UAT Sign-Off',                  '2026-04-07', NULL,          'not_started'),
  ('ms-001-4', 'p-001', 'ph-001-7', 'Go-Live',                       '2026-04-30', NULL,          'not_started');

-- Tasks for p-001
INSERT INTO tasks (id, project_id, phase_id, title, assignee_user_id, due_date, completed_at, status, priority) VALUES
  ('t-001-1', 'p-001', 'ph-001-2', 'Collect network topology diagrams',       'u-pm-001',  '2026-01-28', '2026-01-27', 'completed', 'high'),
  ('t-001-2', 'p-001', 'ph-001-2', 'Document user counts by location',        'u-ae-001',  '2026-01-30', '2026-01-30', 'completed', 'medium'),
  ('t-001-3', 'p-001', 'ph-001-3', 'Draft HLD for Webex Calling rollout',     'u-ae-001',  '2026-02-10', NULL,         'in_progress', 'high'),
  ('t-001-4', 'p-001', 'ph-001-3', 'Confirm PSTN breakout strategy',          'u-pm-001',  '2026-02-12', NULL,         'not_started', 'high'),
  ('t-001-5', 'p-001', 'ph-001-3', 'Schedule design review with customer',    'u-pm-001',  '2026-02-14', NULL,         'not_started', 'medium'),
  ('t-001-6', 'p-001', 'ph-001-4', 'Provision Control Hub org',               'u-ae-001',  '2026-02-20', NULL,         'not_started', 'high'),
  ('t-001-7', 'p-001', 'ph-001-4', 'Configure auto-attendant call flows',     'u-ae-001',  '2026-03-05', NULL,         'not_started', 'medium'),
  ('t-001-8', 'p-001', 'ph-001-5', 'Execute UAT test cases',                  'u-pm-001',  '2026-03-28', NULL,         'not_started', 'high');

-- Risks for p-001
INSERT INTO risks (id, project_id, title, description, severity, status, owner_user_id) VALUES
  ('r-001-1', 'p-001', 'Customer IT bandwidth constraints', 'Customer IT team is resource-constrained; may delay design review approvals.', 'medium', 'open', 'u-pm-001'),
  ('r-001-2', 'p-001', 'PSTN porting timeline uncertainty', 'Number porting from incumbent carrier could add 4–6 weeks if rejected.', 'high', 'open', 'u-ae-001');

-- Notes for p-001
INSERT INTO notes (id, project_id, author_user_id, body, visibility, created_at) VALUES
  ('n-001-1', 'p-001', 'u-pm-001', 'Kickoff call completed. Customer stakeholders engaged, IT lead is Jamie Walsh. Next: kick off discovery sessions.', 'internal', '2026-01-15 14:00:00'),
  ('n-001-2', 'p-001', 'u-ae-001', 'Discovery sessions done. Network diagrams received. HLD drafting in progress.', 'internal', '2026-02-03 10:30:00'),
  ('n-001-3', 'p-001', 'u-pm-001', 'Design review scheduled for Feb 14. Customer confirmed attendance.', 'partner', '2026-02-08 09:00:00');

-- project_access for p-001 (give partner AE access)
INSERT INTO project_access (id, project_id, user_id, access_level) VALUES
  ('pa-001-1', 'p-001', 'u-par-001', 'collaborator');

-- ──────────────────────────────────────────────────────────────────────────
-- PROJECT 2: Globex – Zoom Phone Migration  (in_progress / at_risk)
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO projects (id, name, customer_name, vendor, solution_type, status, health,
  kickoff_date, target_go_live_date, actual_go_live_date, pm_user_id, ae_user_id) VALUES
  ('p-002', 'Globex – Zoom Phone Migration', 'Globex Inc.', 'Zoom', 'UCaaS',
   'in_progress', 'at_risk',
   '2025-11-01', '2026-03-31', NULL,
   'u-pm-001', 'u-ae-001');

-- Phases for p-002
INSERT INTO phases (id, project_id, name, sort_order, planned_start, planned_end, actual_start, actual_end, status) VALUES
  ('ph-002-1', 'p-002', 'Sales Handoff',                        1, '2025-11-01', '2025-11-05', '2025-11-01', '2025-11-04', 'completed'),
  ('ph-002-2', 'p-002', 'Discovery / Requirements',             2, '2025-11-05', '2025-11-19', '2025-11-05', '2025-11-20', 'completed'),
  ('ph-002-3', 'p-002', 'Design',                               3, '2025-11-19', '2025-12-10', '2025-11-20', '2025-12-12', 'completed'),
  ('ph-002-4', 'p-002', 'Provisioning / Configuration / Integration', 4, '2025-12-10', '2026-01-21', '2025-12-13', NULL, 'in_progress'),
  ('ph-002-5', 'p-002', 'Testing / UAT',                        5, '2026-01-21', '2026-02-11', NULL, NULL, 'not_started'),
  ('ph-002-6', 'p-002', 'Training / Enablement',                6, '2026-02-11', '2026-02-25', NULL, NULL, 'not_started'),
  ('ph-002-7', 'p-002', 'Porting / Go-Live',                    7, '2026-02-25', '2026-03-15', NULL, NULL, 'not_started'),
  ('ph-002-8', 'p-002', 'Hypercare',                            8, '2026-03-15', '2026-03-29', NULL, NULL, 'not_started'),
  ('ph-002-9', 'p-002', 'Closed',                               9, '2026-03-29', '2026-03-31', NULL, NULL, 'not_started');

-- Milestones for p-002
INSERT INTO milestones (id, project_id, phase_id, name, target_date, actual_date, status) VALUES
  ('ms-002-1', 'p-002', 'ph-002-3', 'Architecture Sign-Off',          '2025-12-10', '2025-12-12', 'completed'),
  ('ms-002-2', 'p-002', 'ph-002-4', 'Pilot Site Live',                '2026-01-15', NULL,          'in_progress'),
  ('ms-002-3', 'p-002', 'ph-002-5', 'Full UAT Passed',                '2026-02-11', NULL,          'not_started'),
  ('ms-002-4', 'p-002', 'ph-002-7', 'Go-Live',                        '2026-03-15', NULL,          'not_started');

-- Tasks for p-002
INSERT INTO tasks (id, project_id, phase_id, title, assignee_user_id, due_date, completed_at, status, priority) VALUES
  ('t-002-1', 'p-002', 'ph-002-4', 'Complete Zoom Phone tenant provisioning',  'u-ae-001',  '2025-12-20', '2025-12-19', 'completed', 'high'),
  ('t-002-2', 'p-002', 'ph-002-4', 'Migrate pilot site (HQ – 50 users)',       'u-ae-001',  '2026-01-10', NULL,         'in_progress', 'high'),
  ('t-002-3', 'p-002', 'ph-002-4', 'Resolve SIP trunk latency issue',          'u-ae-001',  '2026-01-17', NULL,         'blocked',     'high'),
  ('t-002-4', 'p-002', 'ph-002-4', 'Validate E911 configuration for all sites','u-pm-001',  '2026-01-21', NULL,         'not_started', 'high'),
  ('t-002-5', 'p-002', 'ph-002-5', 'Build UAT test plan',                      'u-pm-001',  '2026-01-28', NULL,         'not_started', 'medium'),
  ('t-002-6', 'p-002', 'ph-002-6', 'Schedule end-user training sessions',      'u-pm-001',  '2026-02-14', NULL,         'not_started', 'medium');

-- Risks for p-002
INSERT INTO risks (id, project_id, title, description, severity, status, owner_user_id) VALUES
  ('r-002-1', 'p-002', 'SIP trunk latency exceeding threshold', 'Latency on the primary SIP trunk is 180ms, above the 150ms target. Carrier investigation in progress.', 'high', 'open', 'u-ae-001'),
  ('r-002-2', 'p-002', 'Go-live date at risk', 'Provisioning phase is 2 weeks behind plan due to SIP issue. Go-live may slip to late April.', 'high', 'open', 'u-pm-001'),
  ('r-002-3', 'p-002', 'E911 compliance gap', 'Remote worker E911 policy not yet finalized with customer legal team.', 'medium', 'open', 'u-pm-001');

-- Notes for p-002
INSERT INTO notes (id, project_id, author_user_id, body, visibility, created_at) VALUES
  ('n-002-1', 'p-002', 'u-pm-001', 'Project health moved to At Risk. SIP trunk issue blocking pilot migration. Carrier ticket opened with Zoom support.', 'internal', '2026-01-12 11:00:00'),
  ('n-002-2', 'p-002', 'u-ae-001', 'Zoom Tier 3 engaged on SIP trunk latency. Targeting resolution by Jan 20.', 'internal', '2026-01-14 15:30:00'),
  ('n-002-3', 'p-002', 'u-pm-001', 'Customer notified of potential go-live delay. They are supportive but need updated schedule by Feb 1.', 'partner', '2026-01-15 09:00:00');

-- project_access for p-002
INSERT INTO project_access (id, project_id, user_id, access_level) VALUES
  ('pa-002-1', 'p-002', 'u-par-002', 'collaborator');

-- ──────────────────────────────────────────────────────────────────────────
-- PROJECT 3: Initech – CCaaS Deployment  (not_started / on_track)
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO projects (id, name, customer_name, vendor, solution_type, status, health,
  kickoff_date, target_go_live_date, actual_go_live_date, pm_user_id, ae_user_id) VALUES
  ('p-003', 'Initech – CCaaS Deployment', 'Initech LLC', 'Cisco', 'CCaaS',
   'not_started', 'on_track',
   '2026-03-17', '2026-07-31', NULL,
   'u-pm-001', 'u-ae-001');

-- Phases for p-003
INSERT INTO phases (id, project_id, name, sort_order, status) VALUES
  ('ph-003-1', 'p-003', 'Sales Handoff',                        1, 'not_started'),
  ('ph-003-2', 'p-003', 'Discovery / Requirements',             2, 'not_started'),
  ('ph-003-3', 'p-003', 'Design',                               3, 'not_started'),
  ('ph-003-4', 'p-003', 'Provisioning / Configuration / Integration', 4, 'not_started'),
  ('ph-003-5', 'p-003', 'Testing / UAT',                        5, 'not_started'),
  ('ph-003-6', 'p-003', 'Training / Enablement',                6, 'not_started'),
  ('ph-003-7', 'p-003', 'Porting / Go-Live',                    7, 'not_started'),
  ('ph-003-8', 'p-003', 'Hypercare',                            8, 'not_started'),
  ('ph-003-9', 'p-003', 'Closed',                               9, 'not_started');

-- Tasks for p-003
INSERT INTO tasks (id, project_id, phase_id, title, assignee_user_id, due_date, completed_at, status, priority) VALUES
  ('t-003-1', 'p-003', 'ph-003-1', 'Obtain signed SOW from customer',  'u-pm-001', '2026-03-20', NULL, 'not_started', 'high'),
  ('t-003-2', 'p-003', 'ph-003-1', 'Schedule kickoff call',             'u-pm-001', '2026-03-18', NULL, 'not_started', 'high'),
  ('t-003-3', 'p-003', 'ph-003-2', 'Identify contact center workflows', 'u-ae-001', '2026-04-01', NULL, 'not_started', 'medium');

-- Notes for p-003
INSERT INTO notes (id, project_id, author_user_id, body, visibility, created_at) VALUES
  ('n-003-1', 'p-003', 'u-pm-001', 'Project created. Kickoff scheduled for March 17. Customer POC is Dana Marsh (IT Director).', 'internal', '2026-03-10 08:00:00');
