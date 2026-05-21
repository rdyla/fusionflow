-- Workforce Management (WFM) + Quality Management (QM) starter templates.
--
-- Same canonical 7-phase layout + 30-workday total as the VA template
-- (#183). WFM and QM typically deploy alongside or after a CCaaS rollout
-- and follow a similar cadence: discover, configure, integrate with the
-- CCaaS, UAT, go-live, hypercare.
--
-- PMs can extend tasks via the admin template UI; this is the starter
-- framework.

-- ════════════════════════════════════════════════════════════════════════
-- WFM — Workforce Management
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO templates (id, name, solution_type, description) VALUES
  ('tmpl-wfm', 'Workforce Management', 'wfm', 'WFM deployment & enablement');

INSERT INTO template_phases (id, template_id, name, order_index, working_days) VALUES
  ('tph-wfm-init', 'tmpl-wfm', 'Initiation',             1, 2),
  ('tph-wfm-plan', 'tmpl-wfm', 'Planning',               2, 5),
  ('tph-wfm-exec', 'tmpl-wfm', 'Executing',              3, 10),
  ('tph-wfm-moni', 'tmpl-wfm', 'Monitoring/Controlling', 4, 5),
  ('tph-wfm-gl',   'tmpl-wfm', 'Go Live / Production',   5, 2),
  ('tph-wfm-cls',  'tmpl-wfm', 'Closing',                6, 1),
  ('tph-wfm-hc',   'tmpl-wfm', 'Hypercare',              7, 5);

INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  -- Initiation
  ('ttsk-wfm-001', 'tmpl-wfm', 'tph-wfm-init', 'Assign Project Manager',                        'high',   1, 'pm'),
  ('ttsk-wfm-002', 'tmpl-wfm', 'tph-wfm-init', 'Assign Implementation Engineer',                'high',   2, 'pm'),
  ('ttsk-wfm-003', 'tmpl-wfm', 'tph-wfm-init', 'Customer Kickoff Meeting',                      'high',   3, 'pm'),
  -- Planning
  ('ttsk-wfm-004', 'tmpl-wfm', 'tph-wfm-plan', 'Forecast & Demand Pattern Discovery',           'high',   1, 'ie'),
  ('ttsk-wfm-005', 'tmpl-wfm', 'tph-wfm-plan', 'Schedule Rules & Shift Requirements Workshop',  'high',   2, 'ie'),
  ('ttsk-wfm-006', 'tmpl-wfm', 'tph-wfm-plan', 'Integration Points Identification (CCaaS / HR / Payroll)', 'medium', 3, 'ie'),
  ('ttsk-wfm-007', 'tmpl-wfm', 'tph-wfm-plan', 'Agent Skills & Capacity Modeling',              'medium', 4, 'ie'),
  ('ttsk-wfm-008', 'tmpl-wfm', 'tph-wfm-plan', 'Document Current Schedule Workflows',           'medium', 5, 'ie'),
  -- Executing
  ('ttsk-wfm-009', 'tmpl-wfm', 'tph-wfm-exec', 'WFM Tenant Provisioning',                       'high',   1, 'ie'),
  ('ttsk-wfm-010', 'tmpl-wfm', 'tph-wfm-exec', 'Forecast Model Configuration',                  'high',   2, 'ie'),
  ('ttsk-wfm-011', 'tmpl-wfm', 'tph-wfm-exec', 'Scheduling Rules Build',                        'high',   3, 'ie'),
  ('ttsk-wfm-012', 'tmpl-wfm', 'tph-wfm-exec', 'CCaaS Integration (Real-Time Adherence)',       'high',   4, 'ie'),
  ('ttsk-wfm-013', 'tmpl-wfm', 'tph-wfm-exec', 'HR / Payroll Integration',                      'medium', 5, 'ie'),
  -- Monitoring/Controlling
  ('ttsk-wfm-014', 'tmpl-wfm', 'tph-wfm-moni', 'UAT Script Development',                        'high',   1, 'ie'),
  ('ttsk-wfm-015', 'tmpl-wfm', 'tph-wfm-moni', 'Customer UAT Execution',                        'high',   2, 'customer'),
  ('ttsk-wfm-016', 'tmpl-wfm', 'tph-wfm-moni', 'Forecast Accuracy Validation',                  'medium', 3, 'ie'),
  -- Go Live / Production
  ('ttsk-wfm-017', 'tmpl-wfm', 'tph-wfm-gl',   'Production Cutover',                            'high',   1, 'ie'),
  ('ttsk-wfm-018', 'tmpl-wfm', 'tph-wfm-gl',   'Live Adherence Validation',                     'high',   2, 'ie'),
  -- Closing
  ('ttsk-wfm-019', 'tmpl-wfm', 'tph-wfm-cls',  'Project Close-out',                             'medium', 1, 'pm'),
  -- Hypercare
  ('ttsk-wfm-020', 'tmpl-wfm', 'tph-wfm-hc',   'Forecast Accuracy Review',                      'medium', 1, 'ie'),
  ('ttsk-wfm-021', 'tmpl-wfm', 'tph-wfm-hc',   'Schedule Optimization Tuning',                  'medium', 2, 'ie');

-- ════════════════════════════════════════════════════════════════════════
-- QM — Quality Management
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO templates (id, name, solution_type, description) VALUES
  ('tmpl-qm', 'Quality Management', 'qm', 'QM deployment & enablement');

INSERT INTO template_phases (id, template_id, name, order_index, working_days) VALUES
  ('tph-qm-init', 'tmpl-qm', 'Initiation',             1, 2),
  ('tph-qm-plan', 'tmpl-qm', 'Planning',               2, 5),
  ('tph-qm-exec', 'tmpl-qm', 'Executing',              3, 10),
  ('tph-qm-moni', 'tmpl-qm', 'Monitoring/Controlling', 4, 5),
  ('tph-qm-gl',   'tmpl-qm', 'Go Live / Production',   5, 2),
  ('tph-qm-cls',  'tmpl-qm', 'Closing',                6, 1),
  ('tph-qm-hc',   'tmpl-qm', 'Hypercare',              7, 5);

INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role) VALUES
  -- Initiation
  ('ttsk-qm-001', 'tmpl-qm', 'tph-qm-init', 'Assign Project Manager',                          'high',   1, 'pm'),
  ('ttsk-qm-002', 'tmpl-qm', 'tph-qm-init', 'Assign Implementation Engineer',                  'high',   2, 'pm'),
  ('ttsk-qm-003', 'tmpl-qm', 'tph-qm-init', 'Customer Kickoff Meeting',                        'high',   3, 'pm'),
  -- Planning
  ('ttsk-qm-004', 'tmpl-qm', 'tph-qm-plan', 'Evaluation Form Design Workshop',                 'high',   1, 'ie'),
  ('ttsk-qm-005', 'tmpl-qm', 'tph-qm-plan', 'Scorecard & Scoring Methodology',                 'high',   2, 'ie'),
  ('ttsk-qm-006', 'tmpl-qm', 'tph-qm-plan', 'CCaaS Recording Integration Identification',      'medium', 3, 'ie'),
  ('ttsk-qm-007', 'tmpl-qm', 'tph-qm-plan', 'Calibration Workflow Design',                     'medium', 4, 'ie'),
  ('ttsk-qm-008', 'tmpl-qm', 'tph-qm-plan', 'Document Existing QA Process',                    'medium', 5, 'ie'),
  -- Executing
  ('ttsk-qm-009', 'tmpl-qm', 'tph-qm-exec', 'QM Tenant Provisioning',                          'high',   1, 'ie'),
  ('ttsk-qm-010', 'tmpl-qm', 'tph-qm-exec', 'Evaluation Form Configuration',                   'high',   2, 'ie'),
  ('ttsk-qm-011', 'tmpl-qm', 'tph-qm-exec', 'Scorecard Build',                                 'high',   3, 'ie'),
  ('ttsk-qm-012', 'tmpl-qm', 'tph-qm-exec', 'CCaaS Recording Integration',                     'high',   4, 'ie'),
  ('ttsk-qm-013', 'tmpl-qm', 'tph-qm-exec', 'Coaching Workflow Configuration',                 'medium', 5, 'ie'),
  -- Monitoring/Controlling
  ('ttsk-qm-014', 'tmpl-qm', 'tph-qm-moni', 'UAT Script Development',                          'high',   1, 'ie'),
  ('ttsk-qm-015', 'tmpl-qm', 'tph-qm-moni', 'Customer UAT Execution',                          'high',   2, 'customer'),
  ('ttsk-qm-016', 'tmpl-qm', 'tph-qm-moni', 'Calibration Session',                             'medium', 3, 'ie'),
  -- Go Live / Production
  ('ttsk-qm-017', 'tmpl-qm', 'tph-qm-gl',   'Production Cutover',                              'high',   1, 'ie'),
  ('ttsk-qm-018', 'tmpl-qm', 'tph-qm-gl',   'Live Evaluation Validation',                      'high',   2, 'ie'),
  -- Closing
  ('ttsk-qm-019', 'tmpl-qm', 'tph-qm-cls',  'Project Close-out',                               'medium', 1, 'pm'),
  -- Hypercare
  ('ttsk-qm-020', 'tmpl-qm', 'tph-qm-hc',   'Evaluation Quality Review',                       'medium', 1, 'ie'),
  ('ttsk-qm-021', 'tmpl-qm', 'tph-qm-hc',   'Coaching Effectiveness Tuning',                   'medium', 2, 'ie');
