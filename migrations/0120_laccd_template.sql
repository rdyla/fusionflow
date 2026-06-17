-- LACCD Project Timeline template (from the customer-provided timeline).
-- Applied per phase (per campus) via the existing "+ Template" action.
-- solution_type is NULL so tasks are not tag-prefixed. working_days and
-- default_assignee_role are sensible defaults, adjustable in Admin → Templates.

INSERT INTO templates (id, name, solution_type, description) VALUES
  ('tmpl-laccd', 'LACCD Project Timeline', NULL,
   'Los Angeles Community College District per-campus implementation timeline.');

INSERT INTO template_stages (id, template_id, name, order_index, working_days) VALUES
  ('tphl-1', 'tmpl-laccd', 'LACCD Project Kick Off', 1, 3),
  ('tphl-2', 'tmpl-laccd', 'Site Survey', 2, 15),
  ('tphl-3', 'tmpl-laccd', 'Zoom Cloud Tenant Preparation and Discovery', 3, 10),
  ('tphl-4', 'tmpl-laccd', 'Build', 4, 10),
  ('tphl-5', 'tmpl-laccd', 'Go-Live Preparation', 5, 5),
  ('tphl-6', 'tmpl-laccd', 'Go Live', 6, 1),
  ('tphl-7', 'tmpl-laccd', 'Post Go Live Support', 7, 10),
  ('tphl-8', 'tmpl-laccd', 'Project Completion', 8, 3);

INSERT INTO template_tasks (id, template_id, stage_id, title, priority, order_index, default_assignee_role, is_go_live_event) VALUES
  -- LACCD Project Kick Off
  ('ttl-101', 'tmpl-laccd', 'tphl-1', 'Kick Off Meeting', 'high', 1, 'all', 0),
  ('ttl-102', 'tmpl-laccd', 'tphl-1', 'Introductions', 'medium', 2, 'all', 0),
  ('ttl-103', 'tmpl-laccd', 'tphl-1', 'Review Scope of Work', 'high', 3, 'pm', 0),
  ('ttl-104', 'tmpl-laccd', 'tphl-1', 'Project Communications', 'medium', 4, 'pm', 0),
  ('ttl-105', 'tmpl-laccd', 'tphl-1', 'Weekly Technical Meeting Set-Up', 'medium', 5, 'pm', 0),
  ('ttl-106', 'tmpl-laccd', 'tphl-1', 'Request Documentation For Each Site', 'high', 6, 'customer', 0),
  -- Site Survey
  ('ttl-201', 'tmpl-laccd', 'tphl-2', 'Preliminary Site Survey Review For All Campuses', 'high', 1, 'pm', 0),
  ('ttl-202', 'tmpl-laccd', 'tphl-2', 'Receive Site Documentation For All Campuses', 'high', 2, 'customer', 0),
  ('ttl-203', 'tmpl-laccd', 'tphl-2', 'Preliminary Campus Walk (Onsite)', 'medium', 3, 'ie', 0),
  ('ttl-204', 'tmpl-laccd', 'tphl-2', 'Compile Documentation and Draft Site Survey Plan', 'medium', 4, 'ie', 0),
  ('ttl-205', 'tmpl-laccd', 'tphl-2', 'Prepare Job Package For Site Surveys', 'medium', 5, 'ie', 0),
  ('ttl-206', 'tmpl-laccd', 'tphl-2', 'Extension & Floor Mapping', 'medium', 6, 'ie', 0),
  ('ttl-207', 'tmpl-laccd', 'tphl-2', 'Analog Cross-Connect Validation', 'medium', 7, 'ie', 0),
  ('ttl-208', 'tmpl-laccd', 'tphl-2', 'Data & Voice Infrastructure Assessment', 'high', 8, 'ie', 0),
  ('ttl-209', 'tmpl-laccd', 'tphl-2', 'Overhead Paging System Assessment', 'medium', 9, 'ie', 0),
  ('ttl-210', 'tmpl-laccd', 'tphl-2', 'Emergency Blue Phone Assessment', 'medium', 10, 'ie', 0),
  ('ttl-211', 'tmpl-laccd', 'tphl-2', 'Identification of Existing POTS Lines', 'medium', 11, 'ie', 0),
  ('ttl-212', 'tmpl-laccd', 'tphl-2', 'Hardware Deployment Review', 'medium', 12, 'ie', 0),
  ('ttl-213', 'tmpl-laccd', 'tphl-2', 'Complete Analog Assessment', 'medium', 13, 'ie', 0),
  ('ttl-214', 'tmpl-laccd', 'tphl-2', 'Post Site Survey Review', 'medium', 14, 'pm', 0),
  ('ttl-215', 'tmpl-laccd', 'tphl-2', 'Finalize Solution Requirements', 'high', 15, 'pm', 0),
  ('ttl-216', 'tmpl-laccd', 'tphl-2', 'Device Deployment Recommendation', 'medium', 16, 'ie', 0),
  -- Zoom Cloud Tenant Preparation and Discovery
  ('ttl-301', 'tmpl-laccd', 'tphl-3', 'Tenant Invitation', 'high', 1, 'pf', 0),
  ('ttl-302', 'tmpl-laccd', 'tphl-3', 'Site Creation', 'medium', 2, 'pf', 0),
  ('ttl-303', 'tmpl-laccd', 'tphl-3', 'Partner Administrative Access', 'medium', 3, 'customer', 0),
  ('ttl-304', 'tmpl-laccd', 'tphl-3', 'SSO (if implemented)', 'medium', 4, 'customer', 0),
  ('ttl-305', 'tmpl-laccd', 'tphl-3', 'Porting Discovery - Receipt of Telco Invoices', 'high', 5, 'zoom_porting', 0),
  ('ttl-306', 'tmpl-laccd', 'tphl-3', 'Porting Discovery - Receipt of Customer Service Records', 'high', 6, 'zoom_porting', 0),
  ('ttl-307', 'tmpl-laccd', 'tphl-3', 'Create workbook for implementation', 'medium', 7, 'pf', 0),
  ('ttl-308', 'tmpl-laccd', 'tphl-3', 'Database Discovery', 'medium', 8, 'pf', 0),
  ('ttl-309', 'tmpl-laccd', 'tphl-3', 'Review Discovery with site contact', 'medium', 9, 'pm', 0),
  ('ttl-310', 'tmpl-laccd', 'tphl-3', 'Callflow/Database Acceptance', 'high', 10, 'customer', 0),
  -- Build
  ('ttl-401', 'tmpl-laccd', 'tphl-4', 'Create End Users, Callflow, Integrations', 'high', 1, 'pf', 0),
  ('ttl-402', 'tmpl-laccd', 'tphl-4', 'Hardware Prep - Boot, Update, Assign MAC Addresses, Sort & Label', 'medium', 2, 'ie', 0),
  ('ttl-403', 'tmpl-laccd', 'tphl-4', 'UAT - Test Callflows, Features, Emergency Services', 'high', 3, 'pf', 0),
  ('ttl-404', 'tmpl-laccd', 'tphl-4', 'UAT Acceptance', 'high', 4, 'customer', 0),
  -- Go-Live Preparation
  ('ttl-501', 'tmpl-laccd', 'tphl-5', 'Port list confirmed and submitted', 'high', 1, 'pf', 0),
  ('ttl-502', 'tmpl-laccd', 'tphl-5', 'Hardware Deployment - Phones, ATA''s placed', 'high', 2, 'ie', 0),
  ('ttl-503', 'tmpl-laccd', 'tphl-5', 'Schedule end-user training', 'medium', 3, 'pm', 0),
  ('ttl-504', 'tmpl-laccd', 'tphl-5', 'Conduct end-user training', 'medium', 4, 'pf', 0),
  -- Go Live
  ('ttl-601', 'tmpl-laccd', 'tphl-6', 'Cutover, Port, Testing', 'high', 1, 'all', 1),
  -- Post Go Live Support
  ('ttl-701', 'tmpl-laccd', 'tphl-7', 'Post Go Live Support', 'medium', 1, 'pf', 0),
  ('ttl-702', 'tmpl-laccd', 'tphl-7', 'Optimizations & Adjustments', 'medium', 2, 'pf', 0),
  -- Project Completion
  ('ttl-801', 'tmpl-laccd', 'tphl-8', 'Open Item Completion', 'medium', 1, 'pm', 0),
  ('ttl-802', 'tmpl-laccd', 'tphl-8', 'Project Documentation Review', 'medium', 2, 'pm', 0),
  ('ttl-803', 'tmpl-laccd', 'tphl-8', 'Customer Success Transition', 'medium', 3, 'csm', 0);
