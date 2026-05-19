-- Virtual Agent (VA) template — canonical 7-phase structure with starter
-- tasks. Mirrors the Initiation / Planning / Executing / Monitoring /
-- Go Live / Closing / Hypercare layout used by the UCaaS + CCaaS templates,
-- so VA can be selected alongside them in the Timeline Builder for combo
-- projects (e.g. CCaaS + VA, or UCaaS + CCaaS + VA).
--
-- Total: 30 workdays (~6 weeks).
-- PMs can extend tasks via the admin template UI; this is the starter set.

-- ── Template ────────────────────────────────────────────────────────────────
INSERT INTO templates (id, name, solution_type, description) VALUES
  ('tmpl-va', 'Virtual Agent', 'va', 'Virtual Agent deployment & enablement');

-- ── Phases (canonical 7, working_days seeded inline) ───────────────────────
INSERT INTO template_phases (id, template_id, name, order_index, working_days) VALUES
  ('tph-va-init', 'tmpl-va', 'Initiation',             1, 2),
  ('tph-va-plan', 'tmpl-va', 'Planning',               2, 5),
  ('tph-va-exec', 'tmpl-va', 'Executing',              3, 10),
  ('tph-va-moni', 'tmpl-va', 'Monitoring/Controlling', 4, 5),
  ('tph-va-gl',   'tmpl-va', 'Go Live / Production',   5, 2),
  ('tph-va-cls',  'tmpl-va', 'Closing',                6, 1),
  ('tph-va-hc',   'tmpl-va', 'Hypercare',              7, 5);

-- ── Tasks (starter framework) ──────────────────────────────────────────────
-- Initiation
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-va-001', 'tmpl-va', 'tph-va-init', 'Assign Project Manager',                'high',   1, 'pm'),
  ('ttsk-va-002', 'tmpl-va', 'tph-va-init', 'Assign Implementation Engineer',        'high',   2, 'pm'),
  ('ttsk-va-003', 'tmpl-va', 'tph-va-init', 'Customer Kickoff Meeting',              'high',   3, 'pm');

-- Planning (Discovery)
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-va-004', 'tmpl-va', 'tph-va-plan', 'Use Case Discovery Workshop',           'high',   1, 'ie'),
  ('ttsk-va-005', 'tmpl-va', 'tph-va-plan', 'Intent & Entity Inventory',             'high',   2, 'ie'),
  ('ttsk-va-006', 'tmpl-va', 'tph-va-plan', 'Integration & Data Source Identification', 'medium', 3, 'ie'),
  ('ttsk-va-007', 'tmpl-va', 'tph-va-plan', 'Conversation Flow Design',              'high',   4, 'ie'),
  ('ttsk-va-008', 'tmpl-va', 'tph-va-plan', 'Document Existing Routing & Fallbacks', 'medium', 5, 'ie');

-- Executing (Configuration + Integration)
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-va-009', 'tmpl-va', 'tph-va-exec', 'VA Tenant Provisioning',                'high',   1, 'ie'),
  ('ttsk-va-010', 'tmpl-va', 'tph-va-exec', 'Intent + Entity Configuration',         'high',   2, 'ie'),
  ('ttsk-va-011', 'tmpl-va', 'tph-va-exec', 'Conversation Flow Build',               'high',   3, 'ie'),
  ('ttsk-va-012', 'tmpl-va', 'tph-va-exec', 'Backend / CRM Integration',             'high',   4, 'ie'),
  ('ttsk-va-013', 'tmpl-va', 'tph-va-exec', 'Voice & Persona Tuning',                'medium', 5, 'ie');

-- Monitoring/Controlling (UAT)
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-va-014', 'tmpl-va', 'tph-va-moni', 'UAT Script Development',                'high',   1, 'ie'),
  ('ttsk-va-015', 'tmpl-va', 'tph-va-moni', 'Customer UAT Execution',                'high',   2, 'customer'),
  ('ttsk-va-016', 'tmpl-va', 'tph-va-moni', 'Refinement Iterations',                 'medium', 3, 'ie');

-- Go Live / Production
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-va-017', 'tmpl-va', 'tph-va-gl',   'Production Cutover',                    'high',   1, 'ie'),
  ('ttsk-va-018', 'tmpl-va', 'tph-va-gl',   'Live Deployment Validation',            'high',   2, 'ie');

-- Closing
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-va-019', 'tmpl-va', 'tph-va-cls',  'Project Close-out',                     'medium', 1, 'pm');

-- Hypercare
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  ('ttsk-va-020', 'tmpl-va', 'tph-va-hc',   'Conversation Analytics Review',         'medium', 1, 'ie'),
  ('ttsk-va-021', 'tmpl-va', 'tph-va-hc',   'Optimization Tuning',                   'medium', 2, 'ie');
