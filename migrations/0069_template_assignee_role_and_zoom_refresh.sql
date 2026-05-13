-- ────────────────────────────────────────────────────────────────────────────
-- Adds an assignee-role hint to template tasks and refreshes the Zoom UCaaS
-- template to match the standardized project plan Zoom provided.
--
-- Zoom's plan ships with an "Assigned To" column for every task (PM / IE /
-- Customer / Zoom Porting / PF / ALL / Customer/IE). Storing it lets the
-- chip UI on the project tasks view show "who owns this" without forcing
-- the PM to manually re-assign on every new project. Later we can wire
-- auto-assign at apply-template time (resolve "pm" → the project's PM).
--
-- Phase structure (7 phases): Zoom uses the PMI vocabulary
--   1. Initiation
--   2. Planning
--   3. Executing
--   4. Monitoring/Controlling
--   5. Go Live / Production
--   6. Closing
-- We tack on:
--   7. Hypercare           -- PF value-add over Zoom's baseline
--
-- Task IDs in this file are NEW (ttsk-uzoom-101+) so they don't collide with
-- the old ttsk-uzoom-001..039 that we're DELETing first. Keeping the old
-- prefix lets us search-and-trace per-template easily.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE template_tasks ADD COLUMN default_assignee_role TEXT;

DELETE FROM template_tasks  WHERE template_id = 'tmpl-ucaas-zoom';
DELETE FROM template_phases WHERE template_id = 'tmpl-ucaas-zoom';

INSERT INTO template_phases (id, template_id, name, order_index) VALUES
  ('tph-uzoom-init', 'tmpl-ucaas-zoom', 'Initiation',             1),
  ('tph-uzoom-plan', 'tmpl-ucaas-zoom', 'Planning',               2),
  ('tph-uzoom-exec', 'tmpl-ucaas-zoom', 'Executing',              3),
  ('tph-uzoom-moni', 'tmpl-ucaas-zoom', 'Monitoring/Controlling', 4),
  ('tph-uzoom-gl',   'tmpl-ucaas-zoom', 'Go Live / Production',   5),
  ('tph-uzoom-cls',  'tmpl-ucaas-zoom', 'Closing',                6),
  ('tph-uzoom-hc',   'tmpl-ucaas-zoom', 'Hypercare',              7);

-- ── Initiation (20 tasks) ──────────────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-uzoom-101', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Assign Project Manager',                                    'high',   1, 'pm'),
  ('ttsk-uzoom-102', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Assign Implementation Engineer',                            'high',   2, 'pm'),
  ('ttsk-uzoom-103', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Create a CE Case',                                          'medium', 3, 'pm'),
  ('ttsk-uzoom-104', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Create Sharepoint Folder',                                  'medium', 4, 'pm'),
  ('ttsk-uzoom-105', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Create Internal Chat Channel',                              'medium', 5, 'pm'),
  ('ttsk-uzoom-106', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Review Contract and SOW',                                   'high',   6, 'pm'),
  ('ttsk-uzoom-107', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Request/Validate Distribution Email with Help Desk',        'medium', 7, 'pm'),
  ('ttsk-uzoom-108', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Create Project Distribution Group in Outlook',              'medium', 8, 'pm'),
  ('ttsk-uzoom-109', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Schedule Internal Kickoff',                                 'medium', 9, 'pm'),
  ('ttsk-uzoom-110', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Send Welcome Email',                                        'medium',10, 'pm'),
  ('ttsk-uzoom-111', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Deliver Internal Kickoff',                                  'high',  11, 'pm'),
  ('ttsk-uzoom-112', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Share AI Summary of Internal Kickoff Notes (Tag to Case)',  'low',   12, 'pm'),
  ('ttsk-uzoom-113', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Schedule Customer Kickoff',                                 'high',  13, 'pm'),
  ('ttsk-uzoom-114', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Prepare Project Kickoff Deck',                              'medium',14, 'pm'),
  ('ttsk-uzoom-115', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Deliver Customer Kickoff',                                  'high',  15, 'pm'),
  ('ttsk-uzoom-116', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Schedule Cadence Project Meetings',                         'medium',16, 'pm'),
  ('ttsk-uzoom-117', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Schedule First Technical Session',                          'medium',17, 'pm'),
  ('ttsk-uzoom-118', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Send Sharepoint Folder Link to Customer',                   'low',   18, 'pm'),
  ('ttsk-uzoom-119', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Confirm Packet Fusion Admin Profile',                       'medium',19, 'pm'),
  ('ttsk-uzoom-120', 'tmpl-ucaas-zoom', 'tph-uzoom-init', 'Share AI Summary of Customer Kickoff Notes (Tag to Case)',  'low',   20, 'pm');

-- ── Planning (40 tasks) ────────────────────────────────────────────────────
-- Assessment And Design (22)
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-uzoom-201', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Confirm Access to Customer''s Tenant',                              'high',   1, 'ie'),
  ('ttsk-uzoom-202', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Confirm Licenses and Hardware',                                    'medium', 2, NULL),
  ('ttsk-uzoom-203', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Provide Customer with Network Port and Firewall Data',             'medium', 3, NULL),
  ('ttsk-uzoom-204', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Extract Call Flow and Database from Legacy System',                'medium', 4, 'ie'),
  ('ttsk-uzoom-205', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Document Users, Sites, Locations, DIDs for Validation',            'medium', 5, 'ie'),
  ('ttsk-uzoom-206', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', '10 DLC Registration (if applicable)',                              'medium', 6, NULL),
  ('ttsk-uzoom-207', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Submit Brand (10DLC)',                                             'medium', 7, NULL),
  ('ttsk-uzoom-208', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Submit Campaign (10DLC)',                                          'medium', 8, NULL),
  ('ttsk-uzoom-209', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Identify Local Toll / Toll-Free SMS Numbers',                      'medium', 9, NULL),
  ('ttsk-uzoom-210', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Request 50+ Numbers to the SMS Campaign via Support Ticket',       'medium',10, 'ie'),
  ('ttsk-uzoom-211', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Document Phone Make, Model, and MAC IDs (if applicable)',          'medium',11, 'ie'),
  ('ttsk-uzoom-212', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Document Existing Call Flow for Validation',                       'medium',12, 'ie'),
  ('ttsk-uzoom-213', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Customer Validation — Users, Sites, Locations, DIDs',              'medium',13, 'customer'),
  ('ttsk-uzoom-214', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Customer Validation — Common Area Phones',                         'medium',14, 'customer'),
  ('ttsk-uzoom-215', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Customer Validation — Auto Receptionists',                         'medium',15, 'customer'),
  ('ttsk-uzoom-216', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Customer Validation — Call Queues',                                'medium',16, 'customer'),
  ('ttsk-uzoom-217', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Customer Validation — Recordings',                                 'medium',17, 'customer'),
  ('ttsk-uzoom-218', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Customer Validation — Business / Holiday Hours',                   'medium',18, 'customer'),
  ('ttsk-uzoom-219', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Customer Validation — Analog Devices / Faxes',                     'medium',19, 'customer'),
  ('ttsk-uzoom-220', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Determine Installation Method (MSI installer)',                    'medium',20, 'ie'),
  ('ttsk-uzoom-221', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Complete Network Assessment',                                      'high',  21, 'ie'),
  ('ttsk-uzoom-222', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Confirm Settings — Personal, Account, Group, Role',                'medium',22, 'ie');

-- Emergency Services (7)
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-uzoom-230', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Collect Site Address Data + Public IPs, Subnets, BSSIDs',          'high',  23, 'ie'),
  ('ttsk-uzoom-231', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Configure Network Data in Tenant Site(s)',                         'high',  24, 'ie'),
  ('ttsk-uzoom-232', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Identify E911 Response Team Members',                              'high',  25, 'ie'),
  ('ttsk-uzoom-233', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Identify E911 Email Address Notification',                         'high',  26, 'ie'),
  ('ttsk-uzoom-234', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Create E911 Call Queue',                                           'high',  27, 'ie'),
  ('ttsk-uzoom-235', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Assign Emergency Pool Number for Non-Extension Users / Common Area', 'high',28, 'ie'),
  ('ttsk-uzoom-236', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Sign E911 Waiver if Necessary',                                    'medium',29, NULL);

-- Porting (planning) (6)
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-uzoom-240', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Confirm List of Numbers to Port',                                  'high',  30, 'pm'),
  ('ttsk-uzoom-241', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Provide Current Copies of Invoices (Toll + Toll-Free DIDs)',       'medium',31, 'pm'),
  ('ttsk-uzoom-242', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Provide Current CSR (Customer Service Record) from Carrier',      'medium',32, 'pm'),
  ('ttsk-uzoom-243', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Identify Authorized Contact on the Account',                       'medium',33, 'pm'),
  ('ttsk-uzoom-244', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Determine CRD (Customer Request Date)',                            'high',  34, 'pm'),
  ('ttsk-uzoom-245', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Prepare LOA for Signature',                                        'high',  35, 'pm');

-- Training (planning) (2)
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-uzoom-250', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Confirm Training for End Users (Count)',                           'medium',36, 'pm'),
  ('ttsk-uzoom-251', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Confirm Training for Admins',                                      'medium',37, 'pm');

-- Communications (planning) (3)
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-uzoom-260', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Prepare Communication Templates',                                  'medium',38, 'pm'),
  ('ttsk-uzoom-261', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Review Communication Strategy with Customer',                      'medium',39, 'pm'),
  ('ttsk-uzoom-262', 'tmpl-ucaas-zoom', 'tph-uzoom-plan', 'Send End-User Communication (Planning Phase)',                     'medium',40, 'customer');

-- ── Executing (17 tasks) ───────────────────────────────────────────────────
-- Porting (5)
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-uzoom-301', 'tmpl-ucaas-zoom', 'tph-uzoom-exec', 'Send LOA to Customer for Signature',                               'high',   1, 'pm'),
  ('ttsk-uzoom-302', 'tmpl-ucaas-zoom', 'tph-uzoom-exec', 'Prepare Bulksheet for Porting Team',                               'high',   2, 'pm'),
  ('ttsk-uzoom-303', 'tmpl-ucaas-zoom', 'tph-uzoom-exec', 'Submit Port Request',                                              'high',   3, 'pm'),
  ('ttsk-uzoom-304', 'tmpl-ucaas-zoom', 'tph-uzoom-exec', 'Confirm Numbers Have Been Added to PBX',                           'high',   4, 'zoom_porting'),
  ('ttsk-uzoom-305', 'tmpl-ucaas-zoom', 'tph-uzoom-exec', 'Send Internal Calendar Invite (Porting Placeholder)',              'low',    5, NULL);

-- Build / Provision System (10)
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-uzoom-310', 'tmpl-ucaas-zoom', 'tph-uzoom-exec', 'Client Software / App Downloaded and Configured on PC',            'medium', 6, 'ie'),
  ('ttsk-uzoom-311', 'tmpl-ucaas-zoom', 'tph-uzoom-exec', 'Confirm Users Have an Account',                                    'medium', 7, 'ie'),
  ('ttsk-uzoom-312', 'tmpl-ucaas-zoom', 'tph-uzoom-exec', 'Build Sites, ARs, and Call Flows',                                 'high',   8, 'ie'),
  ('ttsk-uzoom-313', 'tmpl-ucaas-zoom', 'tph-uzoom-exec', 'Assign Numbers to Users, ARs, CQs, CAPs, etc.',                    'high',   9, 'ie'),
  ('ttsk-uzoom-314', 'tmpl-ucaas-zoom', 'tph-uzoom-exec', 'Build Integration',                                                'medium',10, 'ie'),
  ('ttsk-uzoom-315', 'tmpl-ucaas-zoom', 'tph-uzoom-exec', 'Configure Settings — Account, Site, Group, User Levels',           'medium',11, 'ie'),
  ('ttsk-uzoom-316', 'tmpl-ucaas-zoom', 'tph-uzoom-exec', 'Upload MAC Address for Desk Phones',                               'medium',12, 'ie'),
  ('ttsk-uzoom-317', 'tmpl-ucaas-zoom', 'tph-uzoom-exec', 'Configure Desk Phone Button Assignments',                          'medium',13, 'ie'),
  ('ttsk-uzoom-318', 'tmpl-ucaas-zoom', 'tph-uzoom-exec', 'AA Greetings — Record / Upload / Computer Generated',              'medium',14, 'ie'),
  ('ttsk-uzoom-319', 'tmpl-ucaas-zoom', 'tph-uzoom-exec', 'Emergency Services Configuration',                                 'high',  15, NULL);

-- Training (executing) (2)
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-uzoom-320', 'tmpl-ucaas-zoom', 'tph-uzoom-exec', 'Coordinate Schedule with PF Trainer',                              'medium',16, 'pm'),
  ('ttsk-uzoom-321', 'tmpl-ucaas-zoom', 'tph-uzoom-exec', 'Finalize Training Dates',                                          'medium',17, 'customer');

-- ── Monitoring / Controlling (14 tasks) ────────────────────────────────────
-- Porting Confirmation (2)
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-uzoom-401', 'tmpl-ucaas-zoom', 'tph-uzoom-moni', 'Receive FOC from Carrier (10–15 days)',                            'high',   1, 'pm'),
  ('ttsk-uzoom-402', 'tmpl-ucaas-zoom', 'tph-uzoom-moni', 'Send Calendar Invite for Porting Event to Customer',               'medium', 2, 'pm');

-- Communications (1)
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-uzoom-410', 'tmpl-ucaas-zoom', 'tph-uzoom-moni', 'Send End-User Communication (Monitoring Phase)',                   'medium', 3, 'customer');

-- UAT (11)
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-uzoom-420', 'tmpl-ucaas-zoom', 'tph-uzoom-moni', 'Deploy Hardware (Desk Phones, ATAs, etc.)',                        'high',   4, 'ie'),
  ('ttsk-uzoom-421', 'tmpl-ucaas-zoom', 'tph-uzoom-moni', 'Boot / Register Phones to Cloud',                                  'high',   5, 'ie'),
  ('ttsk-uzoom-422', 'tmpl-ucaas-zoom', 'tph-uzoom-moni', 'Assign Profiles',                                                  'medium', 6, 'ie'),
  ('ttsk-uzoom-423', 'tmpl-ucaas-zoom', 'tph-uzoom-moni', 'Configure CLID',                                                   'medium', 7, 'ie'),
  ('ttsk-uzoom-424', 'tmpl-ucaas-zoom', 'tph-uzoom-moni', 'Provide UAT Test Form',                                            'medium', 8, 'ie'),
  ('ttsk-uzoom-425', 'tmpl-ucaas-zoom', 'tph-uzoom-moni', 'Test Call Flows',                                                  'high',   9, 'customer'),
  ('ttsk-uzoom-426', 'tmpl-ucaas-zoom', 'tph-uzoom-moni', 'Test E911 by Dialing 933',                                         'high',  10, 'customer'),
  ('ttsk-uzoom-427', 'tmpl-ucaas-zoom', 'tph-uzoom-moni', 'Test Analog Devices',                                              'medium',11, 'customer'),
  ('ttsk-uzoom-428', 'tmpl-ucaas-zoom', 'tph-uzoom-moni', 'Review Results of UAT with Customer',                              'high',  12, 'ie'),
  ('ttsk-uzoom-429', 'tmpl-ucaas-zoom', 'tph-uzoom-moni', 'Make Modifications as Needed',                                     'medium',13, 'ie'),
  ('ttsk-uzoom-430', 'tmpl-ucaas-zoom', 'tph-uzoom-moni', 'Receive Sign-Off on UAT from Customer',                            'high',  14, 'ie');

-- ── Go Live / Production (10 tasks) ────────────────────────────────────────
-- Go / No-Go Call Readiness (7)
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-uzoom-501', 'tmpl-ucaas-zoom', 'tph-uzoom-gl',  'Determine Readiness for Go-Live (Tier 1 Support)',                  'high',   1, 'pm'),
  ('ttsk-uzoom-502', 'tmpl-ucaas-zoom', 'tph-uzoom-gl',  'Deliver End-User Training',                                         'high',   2, 'pf'),
  ('ttsk-uzoom-503', 'tmpl-ucaas-zoom', 'tph-uzoom-gl',  'Deliver Admin Training',                                            'high',   3, 'ie'),
  ('ttsk-uzoom-504', 'tmpl-ucaas-zoom', 'tph-uzoom-gl',  'Go Live Event',                                                     'high',   4, 'all'),
  ('ttsk-uzoom-505', 'tmpl-ucaas-zoom', 'tph-uzoom-gl',  'Follow Go-Live Test Plan and Record Results',                       'high',   5, 'customer'),
  ('ttsk-uzoom-506', 'tmpl-ucaas-zoom', 'tph-uzoom-gl',  'Confirm E911 Including Assigned Notification',                      'high',   6, 'customer'),
  ('ttsk-uzoom-507', 'tmpl-ucaas-zoom', 'tph-uzoom-gl',  'Provide Day 1 Support',                                             'high',   7, 'pf');

-- Communications (1)
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-uzoom-510', 'tmpl-ucaas-zoom', 'tph-uzoom-gl',  'Send End-User Communication (Go-Live)',                             'high',   8, 'customer');

-- 10DLC (2)
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-uzoom-520', 'tmpl-ucaas-zoom', 'tph-uzoom-gl',  'Add SMS Numbers to Tenant Following Port Activation (48 hrs)',     'medium', 9, 'customer/ie'),
  ('ttsk-uzoom-521', 'tmpl-ucaas-zoom', 'tph-uzoom-gl',  'Follow Test Plan (10DLC)',                                         'medium',10, 'customer/ie');

-- ── Closing (4 tasks) ──────────────────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-uzoom-601', 'tmpl-ucaas-zoom', 'tph-uzoom-cls', 'Request Cancellation of Old Cloud Services (if applicable)',        'medium', 1, 'customer'),
  ('ttsk-uzoom-602', 'tmpl-ucaas-zoom', 'tph-uzoom-cls', 'Request Cancellation of Telco Services (if applicable)',            'medium', 2, 'customer'),
  ('ttsk-uzoom-603', 'tmpl-ucaas-zoom', 'tph-uzoom-cls', 'Lessons-Learned Call and Project Closure Meeting',                  'medium', 3, 'pm'),
  ('ttsk-uzoom-604', 'tmpl-ucaas-zoom', 'tph-uzoom-cls', 'Transition to CSM',                                                 'high',   4, 'pm');

-- ── Hypercare (3 tasks, PF value-add over Zoom's baseline) ─────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-uzoom-701', 'tmpl-ucaas-zoom', 'tph-uzoom-hc',  'Daily Check-ins Week 1',                                            'medium', 1, 'pm'),
  ('ttsk-uzoom-702', 'tmpl-ucaas-zoom', 'tph-uzoom-hc',  'Issue Tracking and Resolution',                                     'high',   2, 'ie'),
  ('ttsk-uzoom-703', 'tmpl-ucaas-zoom', 'tph-uzoom-hc',  'Hypercare Close-Out Report',                                        'medium', 3, 'pm');
