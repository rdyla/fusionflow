-- ────────────────────────────────────────────────────────────────────────────
-- Aligns the remaining three project plan templates (RC UCaaS, RC Engage CCaaS,
-- and Zoom Revenue Accelerator) to the canonical PMI phase vocabulary used by
-- 0069 (UCaaS-Zoom) and 0072 (ZCC). Phase names match exactly so combo projects
-- merge phases at apply time instead of stacking duplicates. The fuzzy-task-
-- merge logic from 0071 dedupes overlapping tasks within each merged phase.
--
-- Source content (task titles) is carried forward from 0021 with two changes:
--
--   1. Title Case normalization. Every task title is rewritten to consistent
--      Title Case (acronyms preserved: CRM/IVR/UAT/RC/SSO/E911/ZRA/CCaaS/etc.;
--      stopwords lowercase except first/last word). The apply-template handler
--      also runs the same normalizer at apply time as defense-in-depth.
--
--   2. Phase remap to canonical:
--        Discovery (kickoff task)  → Initiation
--        Discovery (everything else) + Design + planning-style → Planning
--        Build / Configuration / Integration → Executing
--        Testing & UAT / QA → Monitoring/Controlling
--        Training prep → Executing; Training delivery → Go Live / Production
--        Go-Live activities → Go Live / Production
--        Hypercare / post-launch → Hypercare
--
-- New default_assignee_role values are populated using the same rubric as 0069:
-- 'pm' for coordination/scheduling/customer-facing, 'ie' for technical/build,
-- 'customer' for customer-side actions, 'pf' for delivery-by-PF tasks.
-- ────────────────────────────────────────────────────────────────────────────

-- ── Template: UCaaS - RingCentral (39 tasks) ─────────────────────────────
DELETE FROM template_tasks  WHERE template_id = 'tmpl-ucaas-rc';
DELETE FROM template_phases WHERE template_id = 'tmpl-ucaas-rc';

INSERT INTO template_phases (id, template_id, name, order_index) VALUES
  ('tph-urc-init', 'tmpl-ucaas-rc', 'Initiation', 1),
  ('tph-urc-plan', 'tmpl-ucaas-rc', 'Planning', 2),
  ('tph-urc-exec', 'tmpl-ucaas-rc', 'Executing', 3),
  ('tph-urc-moni', 'tmpl-ucaas-rc', 'Monitoring/Controlling', 4),
  ('tph-urc-gl', 'tmpl-ucaas-rc', 'Go Live / Production', 5),
  ('tph-urc-hc', 'tmpl-ucaas-rc', 'Hypercare', 6);

-- ── Initiation (1 tasks) ──────────────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-urc-201', 'tmpl-ucaas-rc', 'tph-urc-init', 'Project Kickoff Meeting', 'high',   1, 'pm');

-- ── Planning (12 tasks) ────────────────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-urc-202', 'tmpl-ucaas-rc', 'tph-urc-plan', 'Network Readiness Assessment', 'high',   1, 'ie'),
  ('ttsk-urc-203', 'tmpl-ucaas-rc', 'tph-urc-plan', 'Current State Discovery Call', 'medium',   2, 'ie'),
  ('ttsk-urc-204', 'tmpl-ucaas-rc', 'tph-urc-plan', 'Number Inventory & Porting Requirements', 'medium',   3, 'pm'),
  ('ttsk-urc-205', 'tmpl-ucaas-rc', 'tph-urc-plan', 'User Directory Export', 'medium',   4, 'customer'),
  ('ttsk-urc-206', 'tmpl-ucaas-rc', 'tph-urc-plan', 'E911 Requirements Gathering', 'high',   5, 'ie'),
  ('ttsk-urc-207', 'tmpl-ucaas-rc', 'tph-urc-plan', 'Device Requirements & Ordering', 'medium',   6, 'pm'),
  ('ttsk-urc-208', 'tmpl-ucaas-rc', 'tph-urc-plan', 'RC Admin Portal Access Setup', 'high',   7, 'pm'),
  ('ttsk-urc-209', 'tmpl-ucaas-rc', 'tph-urc-plan', 'Solution Design Document', 'high',   8, 'ie'),
  ('ttsk-urc-210', 'tmpl-ucaas-rc', 'tph-urc-plan', 'Dial Plan & Call Routing Design', 'high',   9, 'ie'),
  ('ttsk-urc-211', 'tmpl-ucaas-rc', 'tph-urc-plan', 'Auto-Receptionist & IVR Design', 'medium',  10, 'ie'),
  ('ttsk-urc-212', 'tmpl-ucaas-rc', 'tph-urc-plan', 'Call Queue Design', 'medium',  11, 'ie'),
  ('ttsk-urc-213', 'tmpl-ucaas-rc', 'tph-urc-plan', 'Training Schedule Planning', 'low',  12, 'pm');

-- ── Executing (12 tasks) ───────────────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-urc-214', 'tmpl-ucaas-rc', 'tph-urc-exec', 'Number Porting Submission', 'high',   1, 'pm'),
  ('ttsk-urc-215', 'tmpl-ucaas-rc', 'tph-urc-exec', 'RC Account Provisioning', 'high',   2, 'ie'),
  ('ttsk-urc-216', 'tmpl-ucaas-rc', 'tph-urc-exec', 'User Extensions & Licensing', 'high',   3, 'ie'),
  ('ttsk-urc-217', 'tmpl-ucaas-rc', 'tph-urc-exec', 'Auto-Receptionist Configuration', 'medium',   4, 'ie'),
  ('ttsk-urc-218', 'tmpl-ucaas-rc', 'tph-urc-exec', 'Call Queue & Ring Group Setup', 'medium',   5, 'ie'),
  ('ttsk-urc-219', 'tmpl-ucaas-rc', 'tph-urc-exec', 'IVR Menu Configuration', 'medium',   6, 'ie'),
  ('ttsk-urc-220', 'tmpl-ucaas-rc', 'tph-urc-exec', 'Number Porting Configuration', 'high',   7, 'ie'),
  ('ttsk-urc-221', 'tmpl-ucaas-rc', 'tph-urc-exec', 'Device Provisioning', 'medium',   8, 'ie'),
  ('ttsk-urc-222', 'tmpl-ucaas-rc', 'tph-urc-exec', 'E911 Configuration', 'high',   9, 'ie'),
  ('ttsk-urc-223', 'tmpl-ucaas-rc', 'tph-urc-exec', 'SSO & Directory Sync', 'medium',  10, 'ie'),
  ('ttsk-urc-224', 'tmpl-ucaas-rc', 'tph-urc-exec', 'RC App Deployment & Policy', 'medium',  11, 'ie'),
  ('ttsk-urc-225', 'tmpl-ucaas-rc', 'tph-urc-exec', 'Training Materials Delivery', 'medium',  12, 'pm');

-- ── Monitoring/Controlling (6 tasks) ──────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-urc-226', 'tmpl-ucaas-rc', 'tph-urc-moni', 'Internal QA Testing', 'high',   1, 'ie'),
  ('ttsk-urc-227', 'tmpl-ucaas-rc', 'tph-urc-moni', 'Client UAT Session', 'high',   2, 'pm'),
  ('ttsk-urc-228', 'tmpl-ucaas-rc', 'tph-urc-moni', 'Number Porting Verification', 'high',   3, 'pm'),
  ('ttsk-urc-229', 'tmpl-ucaas-rc', 'tph-urc-moni', 'Device & Softphone Testing', 'medium',   4, 'ie'),
  ('ttsk-urc-230', 'tmpl-ucaas-rc', 'tph-urc-moni', 'Emergency Calling Test', 'high',   5, 'customer'),
  ('ttsk-urc-231', 'tmpl-ucaas-rc', 'tph-urc-moni', 'UAT Sign-Off', 'high',   6, 'customer');

-- ── Go Live / Production (5 tasks) ────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-urc-232', 'tmpl-ucaas-rc', 'tph-urc-gl', 'Admin Training Session', 'high',   1, 'ie'),
  ('ttsk-urc-233', 'tmpl-ucaas-rc', 'tph-urc-gl', 'End-User RC App Training', 'medium',   2, 'pf'),
  ('ttsk-urc-234', 'tmpl-ucaas-rc', 'tph-urc-gl', 'Cutover Execution', 'high',   3, 'ie'),
  ('ttsk-urc-235', 'tmpl-ucaas-rc', 'tph-urc-gl', 'Go-Live Monitoring', 'high',   4, 'pm'),
  ('ttsk-urc-236', 'tmpl-ucaas-rc', 'tph-urc-gl', 'Post-Cutover Verification', 'high',   5, 'ie');

-- ── Hypercare (3 tasks) ───────────────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-urc-237', 'tmpl-ucaas-rc', 'tph-urc-hc', 'Daily Check-Ins Week 1', 'medium',   1, 'pm'),
  ('ttsk-urc-238', 'tmpl-ucaas-rc', 'tph-urc-hc', 'Issue Tracking & Resolution', 'high',   2, 'ie'),
  ('ttsk-urc-239', 'tmpl-ucaas-rc', 'tph-urc-hc', 'Hypercare Close-Out Report', 'medium',   3, 'pm');


-- ── Template: CCaaS - RingCentral Engage (45 tasks) ──────────────────────
DELETE FROM template_tasks  WHERE template_id = 'tmpl-ccaas-rce';
DELETE FROM template_phases WHERE template_id = 'tmpl-ccaas-rce';

INSERT INTO template_phases (id, template_id, name, order_index) VALUES
  ('tph-rce-init', 'tmpl-ccaas-rce', 'Initiation', 1),
  ('tph-rce-plan', 'tmpl-ccaas-rce', 'Planning', 2),
  ('tph-rce-exec', 'tmpl-ccaas-rce', 'Executing', 3),
  ('tph-rce-moni', 'tmpl-ccaas-rce', 'Monitoring/Controlling', 4),
  ('tph-rce-gl', 'tmpl-ccaas-rce', 'Go Live / Production', 5),
  ('tph-rce-hc', 'tmpl-ccaas-rce', 'Hypercare', 6);

-- ── Initiation (1 tasks) ──────────────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-rce-201', 'tmpl-ccaas-rce', 'tph-rce-init', 'Project Kickoff Meeting', 'high',   1, 'pm');

-- ── Planning (14 tasks) ────────────────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-rce-202', 'tmpl-ccaas-rce', 'tph-rce-plan', 'Engage Requirements Workshop', 'high',   1, 'ie'),
  ('ttsk-rce-203', 'tmpl-ccaas-rce', 'tph-rce-plan', 'Current Routing & IVR Discovery', 'high',   2, 'ie'),
  ('ttsk-rce-204', 'tmpl-ccaas-rce', 'tph-rce-plan', 'Agent & Supervisor Requirements', 'medium',   3, 'ie'),
  ('ttsk-rce-205', 'tmpl-ccaas-rce', 'tph-rce-plan', 'Digital Channel Requirements', 'medium',   4, 'ie'),
  ('ttsk-rce-206', 'tmpl-ccaas-rce', 'tph-rce-plan', 'CRM & Integration Requirements', 'medium',   5, 'ie'),
  ('ttsk-rce-207', 'tmpl-ccaas-rce', 'tph-rce-plan', 'Reporting & WFM Requirements', 'medium',   6, 'ie'),
  ('ttsk-rce-208', 'tmpl-ccaas-rce', 'tph-rce-plan', 'Stakeholder Alignment', 'medium',   7, 'pm'),
  ('ttsk-rce-209', 'tmpl-ccaas-rce', 'tph-rce-plan', 'Solution Design Document', 'high',   8, 'ie'),
  ('ttsk-rce-210', 'tmpl-ccaas-rce', 'tph-rce-plan', 'Routing & Queue Strategy Design', 'high',   9, 'ie'),
  ('ttsk-rce-211', 'tmpl-ccaas-rce', 'tph-rce-plan', 'IVR & Voice Flow Design', 'high',  10, 'ie'),
  ('ttsk-rce-212', 'tmpl-ccaas-rce', 'tph-rce-plan', 'Digital Channel Design', 'medium',  11, 'ie'),
  ('ttsk-rce-213', 'tmpl-ccaas-rce', 'tph-rce-plan', 'Agent Desktop Design', 'medium',  12, 'ie'),
  ('ttsk-rce-214', 'tmpl-ccaas-rce', 'tph-rce-plan', 'CRM Integration Design', 'medium',  13, 'ie'),
  ('ttsk-rce-215', 'tmpl-ccaas-rce', 'tph-rce-plan', 'Reporting Design', 'low',  14, 'ie');

-- ── Executing (11 tasks) ───────────────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-rce-216', 'tmpl-ccaas-rce', 'tph-rce-exec', 'Engage Account Provisioning', 'high',   1, 'ie'),
  ('ttsk-rce-217', 'tmpl-ccaas-rce', 'tph-rce-exec', 'Queue & Routing Configuration', 'high',   2, 'ie'),
  ('ttsk-rce-218', 'tmpl-ccaas-rce', 'tph-rce-exec', 'IVR & Flow Configuration', 'high',   3, 'ie'),
  ('ttsk-rce-219', 'tmpl-ccaas-rce', 'tph-rce-exec', 'Agent Provisioning & Licensing', 'high',   4, 'ie'),
  ('ttsk-rce-220', 'tmpl-ccaas-rce', 'tph-rce-exec', 'Digital Channel Setup', 'medium',   5, 'ie'),
  ('ttsk-rce-221', 'tmpl-ccaas-rce', 'tph-rce-exec', 'Supervisor & Admin Configuration', 'medium',   6, 'ie'),
  ('ttsk-rce-222', 'tmpl-ccaas-rce', 'tph-rce-exec', 'CRM Integration Build', 'medium',   7, 'ie'),
  ('ttsk-rce-223', 'tmpl-ccaas-rce', 'tph-rce-exec', 'Disposition & Wrap-Up Code Setup', 'medium',   8, 'ie'),
  ('ttsk-rce-224', 'tmpl-ccaas-rce', 'tph-rce-exec', 'Reporting & Dashboard Configuration', 'medium',   9, 'ie'),
  ('ttsk-rce-225', 'tmpl-ccaas-rce', 'tph-rce-exec', 'RC Phone Integration', 'medium',  10, 'ie'),
  ('ttsk-rce-226', 'tmpl-ccaas-rce', 'tph-rce-exec', 'Training Materials Delivery', 'medium',  11, 'pm');

-- ── Monitoring/Controlling (8 tasks) ──────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-rce-227', 'tmpl-ccaas-rce', 'tph-rce-moni', 'Internal QA - Voice Routing', 'high',   1, 'ie'),
  ('ttsk-rce-228', 'tmpl-ccaas-rce', 'tph-rce-moni', 'Internal QA - Digital Channels', 'high',   2, 'ie'),
  ('ttsk-rce-229', 'tmpl-ccaas-rce', 'tph-rce-moni', 'Internal QA - Agent Experience', 'medium',   3, 'ie'),
  ('ttsk-rce-230', 'tmpl-ccaas-rce', 'tph-rce-moni', 'Client UAT - Voice Scenarios', 'high',   4, 'customer'),
  ('ttsk-rce-231', 'tmpl-ccaas-rce', 'tph-rce-moni', 'Client UAT - Digital Scenarios', 'high',   5, 'customer'),
  ('ttsk-rce-232', 'tmpl-ccaas-rce', 'tph-rce-moni', 'Reporting Validation', 'medium',   6, 'ie'),
  ('ttsk-rce-233', 'tmpl-ccaas-rce', 'tph-rce-moni', 'Integration Testing', 'medium',   7, 'ie'),
  ('ttsk-rce-234', 'tmpl-ccaas-rce', 'tph-rce-moni', 'UAT Sign-Off', 'high',   8, 'customer');

-- ── Go Live / Production (7 tasks) ────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-rce-235', 'tmpl-ccaas-rce', 'tph-rce-gl', 'Agent Training', 'high',   1, 'ie'),
  ('ttsk-rce-236', 'tmpl-ccaas-rce', 'tph-rce-gl', 'Supervisor Training', 'high',   2, 'ie'),
  ('ttsk-rce-237', 'tmpl-ccaas-rce', 'tph-rce-gl', 'Admin & Reporting Training', 'high',   3, 'ie'),
  ('ttsk-rce-238', 'tmpl-ccaas-rce', 'tph-rce-gl', 'Cutover Execution', 'high',   4, 'ie'),
  ('ttsk-rce-239', 'tmpl-ccaas-rce', 'tph-rce-gl', 'Go-Live Monitoring', 'high',   5, 'pm'),
  ('ttsk-rce-240', 'tmpl-ccaas-rce', 'tph-rce-gl', 'Agent Support Coverage', 'high',   6, 'pm'),
  ('ttsk-rce-241', 'tmpl-ccaas-rce', 'tph-rce-gl', 'Post-Cutover Verification', 'high',   7, 'ie');

-- ── Hypercare (4 tasks) ───────────────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-rce-242', 'tmpl-ccaas-rce', 'tph-rce-hc', 'Daily Check-Ins Week 1', 'high',   1, 'pm'),
  ('ttsk-rce-243', 'tmpl-ccaas-rce', 'tph-rce-hc', 'Issue Tracking & Resolution', 'high',   2, 'ie'),
  ('ttsk-rce-244', 'tmpl-ccaas-rce', 'tph-rce-hc', 'Performance Review', 'medium',   3, 'pm'),
  ('ttsk-rce-245', 'tmpl-ccaas-rce', 'tph-rce-hc', 'Hypercare Close-Out', 'medium',   4, 'pm');


-- ── Template: Zoom Revenue Accelerator (20 tasks) ────────────────────────
DELETE FROM template_tasks  WHERE template_id = 'tmpl-zoom-ra';
DELETE FROM template_phases WHERE template_id = 'tmpl-zoom-ra';

INSERT INTO template_phases (id, template_id, name, order_index) VALUES
  ('tph-zra-init', 'tmpl-zoom-ra', 'Initiation', 1),
  ('tph-zra-plan', 'tmpl-zoom-ra', 'Planning', 2),
  ('tph-zra-exec', 'tmpl-zoom-ra', 'Executing', 3),
  ('tph-zra-gl', 'tmpl-zoom-ra', 'Go Live / Production', 4),
  ('tph-zra-hc', 'tmpl-zoom-ra', 'Hypercare', 5);

-- ── Initiation (1 tasks) ──────────────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-zra-201', 'tmpl-zoom-ra', 'tph-zra-init', 'Project Kickoff', 'high',   1, 'pm');

-- ── Planning (4 tasks) ────────────────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-zra-202', 'tmpl-zoom-ra', 'tph-zra-plan', 'CRM & Tech Stack Discovery', 'high',   1, 'ie'),
  ('ttsk-zra-203', 'tmpl-zoom-ra', 'tph-zra-plan', 'Sales Process & Use Case Mapping', 'medium',   2, 'pm'),
  ('ttsk-zra-204', 'tmpl-zoom-ra', 'tph-zra-plan', 'User & Team Structure Review', 'medium',   3, 'ie'),
  ('ttsk-zra-205', 'tmpl-zoom-ra', 'tph-zra-plan', 'Success Metrics Definition', 'medium',   4, 'pm');

-- ── Executing (9 tasks) ───────────────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-zra-206', 'tmpl-zoom-ra', 'tph-zra-exec', 'ZRA Tenant Provisioning', 'high',   1, 'ie'),
  ('ttsk-zra-207', 'tmpl-zoom-ra', 'tph-zra-exec', 'User Provisioning & Licensing', 'high',   2, 'ie'),
  ('ttsk-zra-208', 'tmpl-zoom-ra', 'tph-zra-exec', 'Team & Hierarchy Configuration', 'medium',   3, 'ie'),
  ('ttsk-zra-209', 'tmpl-zoom-ra', 'tph-zra-exec', 'Conversation Intelligence Settings', 'medium',   4, 'ie'),
  ('ttsk-zra-210', 'tmpl-zoom-ra', 'tph-zra-exec', 'Custom Tracker & Keyword Setup', 'medium',   5, 'ie'),
  ('ttsk-zra-211', 'tmpl-zoom-ra', 'tph-zra-exec', 'CRM Integration (Salesforce/HubSpot)', 'high',   6, 'ie'),
  ('ttsk-zra-212', 'tmpl-zoom-ra', 'tph-zra-exec', 'Calendar & Conferencing Integration', 'medium',   7, 'ie'),
  ('ttsk-zra-213', 'tmpl-zoom-ra', 'tph-zra-exec', 'SSO Configuration', 'medium',   8, 'ie'),
  ('ttsk-zra-214', 'tmpl-zoom-ra', 'tph-zra-exec', 'Playbook & Coaching Workflow Setup', 'medium',   9, 'pm');

-- ── Go Live / Production (4 tasks) ────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-zra-215', 'tmpl-zoom-ra', 'tph-zra-gl', 'Admin Training', 'high',   1, 'ie'),
  ('ttsk-zra-216', 'tmpl-zoom-ra', 'tph-zra-gl', 'Sales Rep Onboarding & Training', 'medium',   2, 'pf'),
  ('ttsk-zra-217', 'tmpl-zoom-ra', 'tph-zra-gl', 'Go-Live Execution', 'high',   3, 'ie'),
  ('ttsk-zra-218', 'tmpl-zoom-ra', 'tph-zra-gl', 'Post-Launch Monitoring', 'medium',   4, 'pm');

-- ── Hypercare (2 tasks) ───────────────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-zra-219', 'tmpl-zoom-ra', 'tph-zra-hc', 'Adoption Baseline Measurement', 'medium',   1, 'pm'),
  ('ttsk-zra-220', 'tmpl-zoom-ra', 'tph-zra-hc', 'Hypercare Close-Out', 'medium',   2, 'pm');
