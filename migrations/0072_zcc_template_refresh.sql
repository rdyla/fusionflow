-- ────────────────────────────────────────────────────────────────────────────
-- Refreshes the CCaaS Zoom Contact Center (ZCC) template to match Zoom's gold-
-- standard project plan, mirroring the 0069 UCaaS refresh.
--
-- Phase names are intentionally aligned with the UCaaS-Zoom template (0069)
-- so combo projects (UCaaS + CCaaS) merge phases instead of stacking two of
-- everything. The fuzzy-task-merge logic from 0071 will dedupe overlapping
-- tasks within each merged phase and tag the rest as [UCaaS+CCaaS] / [CCaaS].
--
-- Assignee mapping from the source's Zoom-internal roles into PF's role keys:
--   Zoom TPM   → pm        (resolves to project.pm_user_id)
--   Zoom TPE   → ie        (resolves to first project_staff engineer)
--   Zoom Team  → all       (intentionally unassigned; multi-recipient)
--   Customer   → customer  (intentionally unassigned; customer-side work)
--
-- The two source phases "Contact Center Build and Test" and "Build and Test"
-- are folded into a single "Executing" phase. Bare label rows in the source
-- (Internal/External Kickoff Call headers, Workbook Tabs section, Go-Live
-- group header, the redundant Hyper-Care task) are dropped — the real work is
-- in their children. Source typos are corrected on the way through.
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM template_tasks  WHERE template_id = 'tmpl-ccaas-zcc';
DELETE FROM template_phases WHERE template_id = 'tmpl-ccaas-zcc';

INSERT INTO template_phases (id, template_id, name, order_index) VALUES
  ('tph-czcc-init', 'tmpl-ccaas-zcc', 'Initiation', 1),
  ('tph-czcc-plan', 'tmpl-ccaas-zcc', 'Planning', 2),
  ('tph-czcc-exec', 'tmpl-ccaas-zcc', 'Executing', 3),
  ('tph-czcc-moni', 'tmpl-ccaas-zcc', 'Monitoring/Controlling', 4),
  ('tph-czcc-gl', 'tmpl-ccaas-zcc', 'Go Live / Production', 5),
  ('tph-czcc-cls', 'tmpl-ccaas-zcc', 'Closing', 6),
  ('tph-czcc-hc', 'tmpl-ccaas-zcc', 'Hypercare', 7);

-- ── Initiation (8 tasks) ──────────────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-czcc-101', 'tmpl-ccaas-zcc', 'tph-czcc-init', 'Project Set-up', 'medium',   1, 'pm'),
  ('ttsk-czcc-102', 'tmpl-ccaas-zcc', 'tph-czcc-init', 'Team Assignments (PE, PE, CSM)', 'medium',   2, 'pm'),
  ('ttsk-czcc-103', 'tmpl-ccaas-zcc', 'tph-czcc-init', 'Create File Share, Chat Channels, Send Welcome Email', 'medium',   3, 'pm'),
  ('ttsk-czcc-104', 'tmpl-ccaas-zcc', 'tph-czcc-init', 'Verify Contact Center Licensing', 'medium',   4, 'ie'),
  ('ttsk-czcc-105', 'tmpl-ccaas-zcc', 'tph-czcc-init', 'Schedule Internal Kickoff Call', 'high',   5, 'pm'),
  ('ttsk-czcc-106', 'tmpl-ccaas-zcc', 'tph-czcc-init', 'Conduct Internal Kickoff Call', 'high',   6, 'pm'),
  ('ttsk-czcc-107', 'tmpl-ccaas-zcc', 'tph-czcc-init', 'Schedule External Kickoff Call', 'high',   7, 'pm'),
  ('ttsk-czcc-108', 'tmpl-ccaas-zcc', 'tph-czcc-init', 'Conduct External Kickoff Call', 'high',   8, 'pm');

-- ── Planning (24 tasks) ────────────────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-czcc-109', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Current-State Assessment', 'medium',   1, 'ie'),
  ('ttsk-czcc-110', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'General Discovery Questions', 'medium',   2, 'ie'),
  ('ttsk-czcc-111', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Interaction Flow Design with Customer', 'medium',   3, 'ie'),
  ('ttsk-czcc-112', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Discussion of Skill and Queues', 'medium',   4, 'ie'),
  ('ttsk-czcc-113', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Discussion of User Roles', 'medium',   5, 'ie'),
  ('ttsk-czcc-114', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Discussion Of Dispositions', 'medium',   6, 'ie'),
  ('ttsk-czcc-115', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Design', 'medium',   7, 'ie'),
  ('ttsk-czcc-116', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Final Flow Review', 'high',   8, 'ie'),
  ('ttsk-czcc-117', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Data Prep', 'high',   9, 'customer'),
  ('ttsk-czcc-118', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'High Level Design Signoff', 'high',  10, 'pm'),
  ('ttsk-czcc-119', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'User Tab', 'medium',  11, 'ie'),
  ('ttsk-czcc-120', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Roles Tab', 'medium',  12, 'ie'),
  ('ttsk-czcc-121', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Skills Tab', 'medium',  13, 'ie'),
  ('ttsk-czcc-122', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Inbox Tab', 'medium',  14, 'ie'),
  ('ttsk-czcc-123', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Queues Tab', 'medium',  15, 'ie'),
  ('ttsk-czcc-124', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Phone Numbers Tab', 'medium',  16, 'ie'),
  ('ttsk-czcc-125', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Routing Profile Tab', 'medium',  17, 'ie'),
  ('ttsk-czcc-126', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Dispositions Tab', 'medium',  18, 'ie'),
  ('ttsk-czcc-127', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Asset Library Tab', 'medium',  19, 'ie'),
  ('ttsk-czcc-128', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Waiting Rooms Tab', 'medium',  20, 'ie'),
  ('ttsk-czcc-129', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Flows Tab', 'medium',  21, 'ie'),
  ('ttsk-czcc-130', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Preferences Tab', 'medium',  22, 'ie'),
  ('ttsk-czcc-131', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Address Book Tab', 'medium',  23, 'ie'),
  ('ttsk-czcc-132', 'tmpl-ccaas-zcc', 'tph-czcc-plan', 'Analytics Tab', 'medium',  24, 'ie');

-- ── Executing (26 tasks) ───────────────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-czcc-133', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Inboxes Created', 'medium',   1, 'ie'),
  ('ttsk-czcc-134', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Asset Library Build', 'medium',   2, 'ie'),
  ('ttsk-czcc-135', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Dispositions Created', 'medium',   3, 'ie'),
  ('ttsk-czcc-136', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Skills Created', 'medium',   4, 'ie'),
  ('ttsk-czcc-137', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Routing Profiles Created', 'medium',   5, 'ie'),
  ('ttsk-czcc-138', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Queues Created', 'medium',   6, 'ie'),
  ('ttsk-czcc-139', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Preferences Set', 'medium',   7, 'ie'),
  ('ttsk-czcc-140', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Entity IDs Created', 'medium',   8, 'ie'),
  ('ttsk-czcc-141', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Roles Created', 'medium',   9, 'ie'),
  ('ttsk-czcc-142', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Users Entered', 'medium',  10, 'ie'),
  ('ttsk-czcc-143', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Users Assigned Roles', 'medium',  11, 'ie'),
  ('ttsk-czcc-144', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Users Assigned Permissions', 'medium',  12, 'ie'),
  ('ttsk-czcc-145', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Flows Created', 'medium',  13, 'ie'),
  ('ttsk-czcc-146', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Phone Numbers Assigned', 'medium',  14, 'ie'),
  ('ttsk-czcc-147', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Provide Web SDK to customer web developer', 'medium',  15, 'ie'),
  ('ttsk-czcc-148', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Waiting Rooms Created', 'medium',  16, 'ie'),
  ('ttsk-czcc-149', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Upload Address Book', 'medium',  17, 'ie'),
  ('ttsk-czcc-150', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'All Functional Testing Passed', 'high',  18, 'ie'),
  ('ttsk-czcc-151', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Review Reports For Accuracy', 'high',  19, 'ie'),
  ('ttsk-czcc-152', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Email #2 Drafted: Zoom Contact Center Cut-over is Near Things to do', 'low',  20, 'customer'),
  ('ttsk-czcc-153', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Build Integration', 'medium',  21, 'customer'),
  ('ttsk-czcc-154', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Build Users & Call Flow', 'medium',  22, 'ie'),
  ('ttsk-czcc-155', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Site Settings', 'medium',  23, 'ie'),
  ('ttsk-czcc-156', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Upload Users', 'medium',  24, 'ie'),
  ('ttsk-czcc-157', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Build ARs & Call Flow', 'medium',  25, 'ie'),
  ('ttsk-czcc-158', 'tmpl-ccaas-zcc', 'tph-czcc-exec', 'Build Acceptance Testing (BAT)', 'medium',  26, 'customer');

-- ── Monitoring/Controlling (5 tasks) ──────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-czcc-159', 'tmpl-ccaas-zcc', 'tph-czcc-moni', 'Email #3 Drafted: Zoom Contact Center Cut-over NOW Things to do and helpdesk', 'low',   1, 'pm'),
  ('ttsk-czcc-160', 'tmpl-ccaas-zcc', 'tph-czcc-moni', 'Training', 'medium',   2, 'ie'),
  ('ttsk-czcc-161', 'tmpl-ccaas-zcc', 'tph-czcc-moni', 'End-User Training', 'medium',   3, 'ie'),
  ('ttsk-czcc-162', 'tmpl-ccaas-zcc', 'tph-czcc-moni', 'Admin Training', 'medium',   4, 'ie'),
  ('ttsk-czcc-163', 'tmpl-ccaas-zcc', 'tph-czcc-moni', 'GoNoGo Call', 'high',   5, 'pm');

-- ── Go Live / Production (1 tasks) ────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-czcc-164', 'tmpl-ccaas-zcc', 'tph-czcc-gl', 'Test DIDs, BYO''X'', Ext-Ext Dialing, Call Flow', 'medium',   1, NULL);

-- ── Closing (3 tasks) ─────────────────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-czcc-165', 'tmpl-ccaas-zcc', 'tph-czcc-cls', 'Post-Action Review Call', 'high',   1, 'pm'),
  ('ttsk-czcc-166', 'tmpl-ccaas-zcc', 'tph-czcc-cls', 'Invoicing', 'medium',   2, 'pm'),
  ('ttsk-czcc-167', 'tmpl-ccaas-zcc', 'tph-czcc-cls', 'Ensure all phases/sites have been billed', 'medium',   3, 'pm');

-- ── Hypercare (5 tasks) ───────────────────────────────────────────────────
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-czcc-168', 'tmpl-ccaas-zcc', 'tph-czcc-hc', 'Email #4 Drafted: Post-Cutover Update and Resources', 'low',   1, 'pm'),
  ('ttsk-czcc-169', 'tmpl-ccaas-zcc', 'tph-czcc-hc', 'Lessons-Learned Call & Transition site to CSM', 'high',   2, 'pm'),
  ('ttsk-czcc-170', 'tmpl-ccaas-zcc', 'tph-czcc-hc', 'Invoicing', 'medium',   3, 'pm'),
  ('ttsk-czcc-171', 'tmpl-ccaas-zcc', 'tph-czcc-hc', 'Send Completion of Phase Email to Customer', 'low',   4, 'pm'),
  ('ttsk-czcc-172', 'tmpl-ccaas-zcc', 'tph-czcc-hc', 'Send Invoice Request by Phase Email to Zoom Billing', 'medium',   5, 'pm');
