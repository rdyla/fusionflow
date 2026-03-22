CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  solution_type TEXT,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE template_phases (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE template_tasks (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  phase_id TEXT REFERENCES template_phases(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',
  order_index INTEGER NOT NULL DEFAULT 0
);

-- ── Template 1: UCaaS - Zoom ────────────────────────────────────────────────

INSERT INTO templates (id, name, solution_type, description) VALUES
  ('tmpl-ucaas-zoom', 'UCaaS - Zoom', 'ucaas', 'Standard Zoom UCaaS implementation');

INSERT INTO template_phases (id, template_id, name, order_index) VALUES
  ('tph-uzoom-disc',  'tmpl-ucaas-zoom', 'Discovery',      1),
  ('tph-uzoom-des',   'tmpl-ucaas-zoom', 'Design',         2),
  ('tph-uzoom-bld',   'tmpl-ucaas-zoom', 'Build',          3),
  ('tph-uzoom-uat',   'tmpl-ucaas-zoom', 'Testing & UAT',  4),
  ('tph-uzoom-trn',   'tmpl-ucaas-zoom', 'Training',       5),
  ('tph-uzoom-gl',    'tmpl-ucaas-zoom', 'Go-Live',        6),
  ('tph-uzoom-hc',    'tmpl-ucaas-zoom', 'Hypercare',      7);

INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index) VALUES
  -- Discovery
  ('ttsk-uzoom-001', 'tmpl-ucaas-zoom', 'tph-uzoom-disc', 'Project kickoff meeting', 'high', 1),
  ('ttsk-uzoom-002', 'tmpl-ucaas-zoom', 'tph-uzoom-disc', 'Network readiness assessment', 'high', 2),
  ('ttsk-uzoom-003', 'tmpl-ucaas-zoom', 'tph-uzoom-disc', 'Current state discovery call', 'medium', 3),
  ('ttsk-uzoom-004', 'tmpl-ucaas-zoom', 'tph-uzoom-disc', 'Number inventory & porting requirements', 'medium', 4),
  ('ttsk-uzoom-005', 'tmpl-ucaas-zoom', 'tph-uzoom-disc', 'User directory export', 'medium', 5),
  ('ttsk-uzoom-006', 'tmpl-ucaas-zoom', 'tph-uzoom-disc', 'E911 requirements gathering', 'high', 6),
  ('ttsk-uzoom-007', 'tmpl-ucaas-zoom', 'tph-uzoom-disc', 'Hardware & device requirements', 'medium', 7),
  ('ttsk-uzoom-008', 'tmpl-ucaas-zoom', 'tph-uzoom-disc', 'Stakeholder alignment', 'medium', 8),
  -- Design
  ('ttsk-uzoom-009', 'tmpl-ucaas-zoom', 'tph-uzoom-des', 'Solution design document', 'high', 1),
  ('ttsk-uzoom-010', 'tmpl-ucaas-zoom', 'tph-uzoom-des', 'Dial plan design', 'high', 2),
  ('ttsk-uzoom-011', 'tmpl-ucaas-zoom', 'tph-uzoom-des', 'Call flow design', 'medium', 3),
  ('ttsk-uzoom-012', 'tmpl-ucaas-zoom', 'tph-uzoom-des', 'Device ordering', 'medium', 4),
  ('ttsk-uzoom-013', 'tmpl-ucaas-zoom', 'tph-uzoom-des', 'Number porting submission', 'high', 5),
  ('ttsk-uzoom-014', 'tmpl-ucaas-zoom', 'tph-uzoom-des', 'Training schedule planning', 'low', 6),
  -- Build
  ('ttsk-uzoom-015', 'tmpl-ucaas-zoom', 'tph-uzoom-bld', 'Zoom tenant provisioning', 'high', 1),
  ('ttsk-uzoom-016', 'tmpl-ucaas-zoom', 'tph-uzoom-bld', 'User provisioning & licensing', 'high', 2),
  ('ttsk-uzoom-017', 'tmpl-ucaas-zoom', 'tph-uzoom-bld', 'Call queue configuration', 'medium', 3),
  ('ttsk-uzoom-018', 'tmpl-ucaas-zoom', 'tph-uzoom-bld', 'Auto-receptionist configuration', 'medium', 4),
  ('ttsk-uzoom-019', 'tmpl-ucaas-zoom', 'tph-uzoom-bld', 'Device provisioning & firmware update', 'medium', 5),
  ('ttsk-uzoom-020', 'tmpl-ucaas-zoom', 'tph-uzoom-bld', 'Number porting configuration', 'high', 6),
  ('ttsk-uzoom-021', 'tmpl-ucaas-zoom', 'tph-uzoom-bld', 'Voicemail configuration', 'medium', 7),
  ('ttsk-uzoom-022', 'tmpl-ucaas-zoom', 'tph-uzoom-bld', 'E911 location configuration', 'high', 8),
  ('ttsk-uzoom-023', 'tmpl-ucaas-zoom', 'tph-uzoom-bld', 'SSO & directory sync configuration', 'medium', 9),
  ('ttsk-uzoom-024', 'tmpl-ucaas-zoom', 'tph-uzoom-bld', 'Zoom Phone policy configuration', 'medium', 10),
  -- Testing & UAT
  ('ttsk-uzoom-025', 'tmpl-ucaas-zoom', 'tph-uzoom-uat', 'Internal QA testing', 'high', 1),
  ('ttsk-uzoom-026', 'tmpl-ucaas-zoom', 'tph-uzoom-uat', 'Client UAT session', 'high', 2),
  ('ttsk-uzoom-027', 'tmpl-ucaas-zoom', 'tph-uzoom-uat', 'Number porting verification', 'high', 3),
  ('ttsk-uzoom-028', 'tmpl-ucaas-zoom', 'tph-uzoom-uat', 'Device functionality testing', 'medium', 4),
  ('ttsk-uzoom-029', 'tmpl-ucaas-zoom', 'tph-uzoom-uat', 'Emergency calling (E911) test', 'high', 5),
  ('ttsk-uzoom-030', 'tmpl-ucaas-zoom', 'tph-uzoom-uat', 'UAT sign-off documentation', 'high', 6),
  -- Training
  ('ttsk-uzoom-031', 'tmpl-ucaas-zoom', 'tph-uzoom-trn', 'Admin training session', 'high', 1),
  ('ttsk-uzoom-032', 'tmpl-ucaas-zoom', 'tph-uzoom-trn', 'End-user training', 'medium', 2),
  ('ttsk-uzoom-033', 'tmpl-ucaas-zoom', 'tph-uzoom-trn', 'Training materials delivery', 'medium', 3),
  -- Go-Live
  ('ttsk-uzoom-034', 'tmpl-ucaas-zoom', 'tph-uzoom-gl', 'Cutover execution', 'high', 1),
  ('ttsk-uzoom-035', 'tmpl-ucaas-zoom', 'tph-uzoom-gl', 'Go-live monitoring', 'high', 2),
  ('ttsk-uzoom-036', 'tmpl-ucaas-zoom', 'tph-uzoom-gl', 'Post-cutover verification', 'high', 3),
  -- Hypercare
  ('ttsk-uzoom-037', 'tmpl-ucaas-zoom', 'tph-uzoom-hc', 'Daily check-ins week 1', 'medium', 1),
  ('ttsk-uzoom-038', 'tmpl-ucaas-zoom', 'tph-uzoom-hc', 'Issue tracking & resolution', 'high', 2),
  ('ttsk-uzoom-039', 'tmpl-ucaas-zoom', 'tph-uzoom-hc', 'Hypercare close-out report', 'medium', 3);

-- ── Template 2: UCaaS - RingCentral ─────────────────────────────────────────

INSERT INTO templates (id, name, solution_type, description) VALUES
  ('tmpl-ucaas-rc', 'UCaaS - RingCentral', 'ucaas', 'Standard RingCentral UCaaS implementation');

INSERT INTO template_phases (id, template_id, name, order_index) VALUES
  ('tph-urc-disc', 'tmpl-ucaas-rc', 'Discovery',      1),
  ('tph-urc-des',  'tmpl-ucaas-rc', 'Design',         2),
  ('tph-urc-bld',  'tmpl-ucaas-rc', 'Build',          3),
  ('tph-urc-uat',  'tmpl-ucaas-rc', 'Testing & UAT',  4),
  ('tph-urc-trn',  'tmpl-ucaas-rc', 'Training',       5),
  ('tph-urc-gl',   'tmpl-ucaas-rc', 'Go-Live',        6),
  ('tph-urc-hc',   'tmpl-ucaas-rc', 'Hypercare',      7);

INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index) VALUES
  -- Discovery
  ('ttsk-urc-001', 'tmpl-ucaas-rc', 'tph-urc-disc', 'Project kickoff meeting', 'high', 1),
  ('ttsk-urc-002', 'tmpl-ucaas-rc', 'tph-urc-disc', 'Network readiness assessment', 'high', 2),
  ('ttsk-urc-003', 'tmpl-ucaas-rc', 'tph-urc-disc', 'Current state discovery call', 'medium', 3),
  ('ttsk-urc-004', 'tmpl-ucaas-rc', 'tph-urc-disc', 'Number inventory & porting requirements', 'medium', 4),
  ('ttsk-urc-005', 'tmpl-ucaas-rc', 'tph-urc-disc', 'User directory export', 'medium', 5),
  ('ttsk-urc-006', 'tmpl-ucaas-rc', 'tph-urc-disc', 'E911 requirements gathering', 'high', 6),
  ('ttsk-urc-007', 'tmpl-ucaas-rc', 'tph-urc-disc', 'Device requirements & ordering', 'medium', 7),
  ('ttsk-urc-008', 'tmpl-ucaas-rc', 'tph-urc-disc', 'RC admin portal access setup', 'high', 8),
  -- Design
  ('ttsk-urc-009', 'tmpl-ucaas-rc', 'tph-urc-des', 'Solution design document', 'high', 1),
  ('ttsk-urc-010', 'tmpl-ucaas-rc', 'tph-urc-des', 'Dial plan & call routing design', 'high', 2),
  ('ttsk-urc-011', 'tmpl-ucaas-rc', 'tph-urc-des', 'Auto-receptionist & IVR design', 'medium', 3),
  ('ttsk-urc-012', 'tmpl-ucaas-rc', 'tph-urc-des', 'Call queue design', 'medium', 4),
  ('ttsk-urc-013', 'tmpl-ucaas-rc', 'tph-urc-des', 'Number porting submission', 'high', 5),
  ('ttsk-urc-014', 'tmpl-ucaas-rc', 'tph-urc-des', 'Training schedule planning', 'low', 6),
  -- Build
  ('ttsk-urc-015', 'tmpl-ucaas-rc', 'tph-urc-bld', 'RC account provisioning', 'high', 1),
  ('ttsk-urc-016', 'tmpl-ucaas-rc', 'tph-urc-bld', 'User extensions & licensing', 'high', 2),
  ('ttsk-urc-017', 'tmpl-ucaas-rc', 'tph-urc-bld', 'Auto-receptionist configuration', 'medium', 3),
  ('ttsk-urc-018', 'tmpl-ucaas-rc', 'tph-urc-bld', 'Call queue & ring group setup', 'medium', 4),
  ('ttsk-urc-019', 'tmpl-ucaas-rc', 'tph-urc-bld', 'IVR menu configuration', 'medium', 5),
  ('ttsk-urc-020', 'tmpl-ucaas-rc', 'tph-urc-bld', 'Number porting configuration', 'high', 6),
  ('ttsk-urc-021', 'tmpl-ucaas-rc', 'tph-urc-bld', 'Device provisioning', 'medium', 7),
  ('ttsk-urc-022', 'tmpl-ucaas-rc', 'tph-urc-bld', 'E911 configuration', 'high', 8),
  ('ttsk-urc-023', 'tmpl-ucaas-rc', 'tph-urc-bld', 'SSO & directory sync', 'medium', 9),
  ('ttsk-urc-024', 'tmpl-ucaas-rc', 'tph-urc-bld', 'RC app deployment & policy', 'medium', 10),
  -- Testing & UAT
  ('ttsk-urc-025', 'tmpl-ucaas-rc', 'tph-urc-uat', 'Internal QA testing', 'high', 1),
  ('ttsk-urc-026', 'tmpl-ucaas-rc', 'tph-urc-uat', 'Client UAT session', 'high', 2),
  ('ttsk-urc-027', 'tmpl-ucaas-rc', 'tph-urc-uat', 'Number porting verification', 'high', 3),
  ('ttsk-urc-028', 'tmpl-ucaas-rc', 'tph-urc-uat', 'Device & softphone testing', 'medium', 4),
  ('ttsk-urc-029', 'tmpl-ucaas-rc', 'tph-urc-uat', 'Emergency calling test', 'high', 5),
  ('ttsk-urc-030', 'tmpl-ucaas-rc', 'tph-urc-uat', 'UAT sign-off', 'high', 6),
  -- Training
  ('ttsk-urc-031', 'tmpl-ucaas-rc', 'tph-urc-trn', 'Admin training session', 'high', 1),
  ('ttsk-urc-032', 'tmpl-ucaas-rc', 'tph-urc-trn', 'End-user RC app training', 'medium', 2),
  ('ttsk-urc-033', 'tmpl-ucaas-rc', 'tph-urc-trn', 'Training materials delivery', 'medium', 3),
  -- Go-Live
  ('ttsk-urc-034', 'tmpl-ucaas-rc', 'tph-urc-gl', 'Cutover execution', 'high', 1),
  ('ttsk-urc-035', 'tmpl-ucaas-rc', 'tph-urc-gl', 'Go-live monitoring', 'high', 2),
  ('ttsk-urc-036', 'tmpl-ucaas-rc', 'tph-urc-gl', 'Post-cutover verification', 'high', 3),
  -- Hypercare
  ('ttsk-urc-037', 'tmpl-ucaas-rc', 'tph-urc-hc', 'Daily check-ins week 1', 'medium', 1),
  ('ttsk-urc-038', 'tmpl-ucaas-rc', 'tph-urc-hc', 'Issue tracking & resolution', 'high', 2),
  ('ttsk-urc-039', 'tmpl-ucaas-rc', 'tph-urc-hc', 'Hypercare close-out report', 'medium', 3);

-- ── Template 3: CCaaS - Zoom Contact Center ──────────────────────────────────

INSERT INTO templates (id, name, solution_type, description) VALUES
  ('tmpl-ccaas-zcc', 'CCaaS - Zoom Contact Center', 'ccaas', 'Zoom Contact Center CCaaS implementation');

INSERT INTO template_phases (id, template_id, name, order_index) VALUES
  ('tph-zcc-disc', 'tmpl-ccaas-zcc', 'Discovery',  1),
  ('tph-zcc-des',  'tmpl-ccaas-zcc', 'Design',     2),
  ('tph-zcc-bld',  'tmpl-ccaas-zcc', 'Build',      3),
  ('tph-zcc-qa',   'tmpl-ccaas-zcc', 'QA',         4),
  ('tph-zcc-trn',  'tmpl-ccaas-zcc', 'Training',   5),
  ('tph-zcc-gl',   'tmpl-ccaas-zcc', 'Go-Live',    6),
  ('tph-zcc-hc',   'tmpl-ccaas-zcc', 'Hypercare',  7);

INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index) VALUES
  -- Discovery
  ('ttsk-zcc-001', 'tmpl-ccaas-zcc', 'tph-zcc-disc', 'Project kickoff meeting', 'high', 1),
  ('ttsk-zcc-002', 'tmpl-ccaas-zcc', 'tph-zcc-disc', 'Contact center requirements workshop', 'high', 2),
  ('ttsk-zcc-003', 'tmpl-ccaas-zcc', 'tph-zcc-disc', 'Current routing & IVR discovery', 'high', 3),
  ('ttsk-zcc-004', 'tmpl-ccaas-zcc', 'tph-zcc-disc', 'Agent & supervisor requirements', 'medium', 4),
  ('ttsk-zcc-005', 'tmpl-ccaas-zcc', 'tph-zcc-disc', 'CRM & integration requirements', 'medium', 5),
  ('ttsk-zcc-006', 'tmpl-ccaas-zcc', 'tph-zcc-disc', 'Reporting & analytics requirements', 'medium', 6),
  ('ttsk-zcc-007', 'tmpl-ccaas-zcc', 'tph-zcc-disc', 'Workforce management requirements', 'low', 7),
  ('ttsk-zcc-008', 'tmpl-ccaas-zcc', 'tph-zcc-disc', 'Stakeholder alignment', 'medium', 8),
  -- Design
  ('ttsk-zcc-009', 'tmpl-ccaas-zcc', 'tph-zcc-des', 'Solution design document', 'high', 1),
  ('ttsk-zcc-010', 'tmpl-ccaas-zcc', 'tph-zcc-des', 'IVR & call flow design', 'high', 2),
  ('ttsk-zcc-011', 'tmpl-ccaas-zcc', 'tph-zcc-des', 'Queue & routing strategy design', 'high', 3),
  ('ttsk-zcc-012', 'tmpl-ccaas-zcc', 'tph-zcc-des', 'Agent desktop configuration design', 'medium', 4),
  ('ttsk-zcc-013', 'tmpl-ccaas-zcc', 'tph-zcc-des', 'CRM integration design', 'medium', 5),
  ('ttsk-zcc-014', 'tmpl-ccaas-zcc', 'tph-zcc-des', 'Reporting & dashboard design', 'medium', 6),
  ('ttsk-zcc-015', 'tmpl-ccaas-zcc', 'tph-zcc-des', 'Quality management design', 'low', 7),
  -- Build
  ('ttsk-zcc-016', 'tmpl-ccaas-zcc', 'tph-zcc-bld', 'Zoom CC tenant provisioning', 'high', 1),
  ('ttsk-zcc-017', 'tmpl-ccaas-zcc', 'tph-zcc-bld', 'Queue configuration', 'high', 2),
  ('ttsk-zcc-018', 'tmpl-ccaas-zcc', 'tph-zcc-bld', 'IVR & flow builder configuration', 'high', 3),
  ('ttsk-zcc-019', 'tmpl-ccaas-zcc', 'tph-zcc-bld', 'Agent licensing & provisioning', 'high', 4),
  ('ttsk-zcc-020', 'tmpl-ccaas-zcc', 'tph-zcc-bld', 'Supervisor & admin setup', 'medium', 5),
  ('ttsk-zcc-021', 'tmpl-ccaas-zcc', 'tph-zcc-bld', 'Wrap-up code configuration', 'medium', 6),
  ('ttsk-zcc-022', 'tmpl-ccaas-zcc', 'tph-zcc-bld', 'CRM integration build', 'medium', 7),
  ('ttsk-zcc-023', 'tmpl-ccaas-zcc', 'tph-zcc-bld', 'Zoom Phone integration', 'medium', 8),
  ('ttsk-zcc-024', 'tmpl-ccaas-zcc', 'tph-zcc-bld', 'Reporting & dashboard configuration', 'medium', 9),
  ('ttsk-zcc-025', 'tmpl-ccaas-zcc', 'tph-zcc-bld', 'Quality management setup', 'low', 10),
  ('ttsk-zcc-026', 'tmpl-ccaas-zcc', 'tph-zcc-bld', 'Voicemail & overflow configuration', 'medium', 11),
  -- QA
  ('ttsk-zcc-027', 'tmpl-ccaas-zcc', 'tph-zcc-qa', 'Internal QA - call routing', 'high', 1),
  ('ttsk-zcc-028', 'tmpl-ccaas-zcc', 'tph-zcc-qa', 'Internal QA - IVR flows', 'high', 2),
  ('ttsk-zcc-029', 'tmpl-ccaas-zcc', 'tph-zcc-qa', 'Internal QA - agent experience', 'medium', 3),
  ('ttsk-zcc-030', 'tmpl-ccaas-zcc', 'tph-zcc-qa', 'Internal QA - supervisor tools', 'medium', 4),
  ('ttsk-zcc-031', 'tmpl-ccaas-zcc', 'tph-zcc-qa', 'Client UAT - agent scenario testing', 'high', 5),
  ('ttsk-zcc-032', 'tmpl-ccaas-zcc', 'tph-zcc-qa', 'Client UAT - supervisor scenario', 'high', 6),
  ('ttsk-zcc-033', 'tmpl-ccaas-zcc', 'tph-zcc-qa', 'Reporting validation', 'medium', 7),
  ('ttsk-zcc-034', 'tmpl-ccaas-zcc', 'tph-zcc-qa', 'CRM integration testing', 'medium', 8),
  ('ttsk-zcc-035', 'tmpl-ccaas-zcc', 'tph-zcc-qa', 'UAT sign-off', 'high', 9),
  -- Training
  ('ttsk-zcc-036', 'tmpl-ccaas-zcc', 'tph-zcc-trn', 'Agent training - core platform', 'high', 1),
  ('ttsk-zcc-037', 'tmpl-ccaas-zcc', 'tph-zcc-trn', 'Supervisor training', 'high', 2),
  ('ttsk-zcc-038', 'tmpl-ccaas-zcc', 'tph-zcc-trn', 'Admin training', 'high', 3),
  ('ttsk-zcc-039', 'tmpl-ccaas-zcc', 'tph-zcc-trn', 'Reporting & analytics training', 'medium', 4),
  ('ttsk-zcc-040', 'tmpl-ccaas-zcc', 'tph-zcc-trn', 'Training materials delivery', 'medium', 5),
  -- Go-Live
  ('ttsk-zcc-041', 'tmpl-ccaas-zcc', 'tph-zcc-gl', 'Cutover execution', 'high', 1),
  ('ttsk-zcc-042', 'tmpl-ccaas-zcc', 'tph-zcc-gl', 'Go-live monitoring', 'high', 2),
  ('ttsk-zcc-043', 'tmpl-ccaas-zcc', 'tph-zcc-gl', 'Agent support coverage', 'high', 3),
  ('ttsk-zcc-044', 'tmpl-ccaas-zcc', 'tph-zcc-gl', 'Post-cutover verification', 'high', 4),
  -- Hypercare
  ('ttsk-zcc-045', 'tmpl-ccaas-zcc', 'tph-zcc-hc', 'Daily check-ins week 1', 'high', 1),
  ('ttsk-zcc-046', 'tmpl-ccaas-zcc', 'tph-zcc-hc', 'Issue tracking & resolution', 'high', 2),
  ('ttsk-zcc-047', 'tmpl-ccaas-zcc', 'tph-zcc-hc', 'Performance baseline review', 'medium', 3),
  ('ttsk-zcc-048', 'tmpl-ccaas-zcc', 'tph-zcc-hc', 'Hypercare close-out report', 'medium', 4);

-- ── Template 4: CCaaS - RingCentral Engage ───────────────────────────────────

INSERT INTO templates (id, name, solution_type, description) VALUES
  ('tmpl-ccaas-rce', 'CCaaS - RingCentral Engage', 'ccaas', 'RingCentral Engage CCaaS implementation');

INSERT INTO template_phases (id, template_id, name, order_index) VALUES
  ('tph-rce-disc', 'tmpl-ccaas-rce', 'Discovery',  1),
  ('tph-rce-des',  'tmpl-ccaas-rce', 'Design',     2),
  ('tph-rce-bld',  'tmpl-ccaas-rce', 'Build',      3),
  ('tph-rce-qa',   'tmpl-ccaas-rce', 'QA',         4),
  ('tph-rce-trn',  'tmpl-ccaas-rce', 'Training',   5),
  ('tph-rce-gl',   'tmpl-ccaas-rce', 'Go-Live',    6),
  ('tph-rce-hc',   'tmpl-ccaas-rce', 'Hypercare',  7);

INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index) VALUES
  -- Discovery
  ('ttsk-rce-001', 'tmpl-ccaas-rce', 'tph-rce-disc', 'Project kickoff meeting', 'high', 1),
  ('ttsk-rce-002', 'tmpl-ccaas-rce', 'tph-rce-disc', 'Engage requirements workshop', 'high', 2),
  ('ttsk-rce-003', 'tmpl-ccaas-rce', 'tph-rce-disc', 'Current routing & IVR discovery', 'high', 3),
  ('ttsk-rce-004', 'tmpl-ccaas-rce', 'tph-rce-disc', 'Agent & supervisor requirements', 'medium', 4),
  ('ttsk-rce-005', 'tmpl-ccaas-rce', 'tph-rce-disc', 'Digital channel requirements', 'medium', 5),
  ('ttsk-rce-006', 'tmpl-ccaas-rce', 'tph-rce-disc', 'CRM & integration requirements', 'medium', 6),
  ('ttsk-rce-007', 'tmpl-ccaas-rce', 'tph-rce-disc', 'Reporting & WFM requirements', 'medium', 7),
  ('ttsk-rce-008', 'tmpl-ccaas-rce', 'tph-rce-disc', 'Stakeholder alignment', 'medium', 8),
  -- Design
  ('ttsk-rce-009', 'tmpl-ccaas-rce', 'tph-rce-des', 'Solution design document', 'high', 1),
  ('ttsk-rce-010', 'tmpl-ccaas-rce', 'tph-rce-des', 'Routing & queue strategy design', 'high', 2),
  ('ttsk-rce-011', 'tmpl-ccaas-rce', 'tph-rce-des', 'IVR & voice flow design', 'high', 3),
  ('ttsk-rce-012', 'tmpl-ccaas-rce', 'tph-rce-des', 'Digital channel design', 'medium', 4),
  ('ttsk-rce-013', 'tmpl-ccaas-rce', 'tph-rce-des', 'Agent desktop design', 'medium', 5),
  ('ttsk-rce-014', 'tmpl-ccaas-rce', 'tph-rce-des', 'CRM integration design', 'medium', 6),
  ('ttsk-rce-015', 'tmpl-ccaas-rce', 'tph-rce-des', 'Reporting design', 'low', 7),
  -- Build
  ('ttsk-rce-016', 'tmpl-ccaas-rce', 'tph-rce-bld', 'Engage account provisioning', 'high', 1),
  ('ttsk-rce-017', 'tmpl-ccaas-rce', 'tph-rce-bld', 'Queue & routing configuration', 'high', 2),
  ('ttsk-rce-018', 'tmpl-ccaas-rce', 'tph-rce-bld', 'IVR & flow configuration', 'high', 3),
  ('ttsk-rce-019', 'tmpl-ccaas-rce', 'tph-rce-bld', 'Agent provisioning & licensing', 'high', 4),
  ('ttsk-rce-020', 'tmpl-ccaas-rce', 'tph-rce-bld', 'Digital channel setup', 'medium', 5),
  ('ttsk-rce-021', 'tmpl-ccaas-rce', 'tph-rce-bld', 'Supervisor & admin configuration', 'medium', 6),
  ('ttsk-rce-022', 'tmpl-ccaas-rce', 'tph-rce-bld', 'CRM integration build', 'medium', 7),
  ('ttsk-rce-023', 'tmpl-ccaas-rce', 'tph-rce-bld', 'Disposition & wrap-up code setup', 'medium', 8),
  ('ttsk-rce-024', 'tmpl-ccaas-rce', 'tph-rce-bld', 'Reporting & dashboard configuration', 'medium', 9),
  ('ttsk-rce-025', 'tmpl-ccaas-rce', 'tph-rce-bld', 'RC Phone integration', 'medium', 10),
  -- QA
  ('ttsk-rce-026', 'tmpl-ccaas-rce', 'tph-rce-qa', 'Internal QA - voice routing', 'high', 1),
  ('ttsk-rce-027', 'tmpl-ccaas-rce', 'tph-rce-qa', 'Internal QA - digital channels', 'high', 2),
  ('ttsk-rce-028', 'tmpl-ccaas-rce', 'tph-rce-qa', 'Internal QA - agent experience', 'medium', 3),
  ('ttsk-rce-029', 'tmpl-ccaas-rce', 'tph-rce-qa', 'Client UAT - voice scenarios', 'high', 4),
  ('ttsk-rce-030', 'tmpl-ccaas-rce', 'tph-rce-qa', 'Client UAT - digital scenarios', 'high', 5),
  ('ttsk-rce-031', 'tmpl-ccaas-rce', 'tph-rce-qa', 'Reporting validation', 'medium', 6),
  ('ttsk-rce-032', 'tmpl-ccaas-rce', 'tph-rce-qa', 'Integration testing', 'medium', 7),
  ('ttsk-rce-033', 'tmpl-ccaas-rce', 'tph-rce-qa', 'UAT sign-off', 'high', 8),
  -- Training
  ('ttsk-rce-034', 'tmpl-ccaas-rce', 'tph-rce-trn', 'Agent training', 'high', 1),
  ('ttsk-rce-035', 'tmpl-ccaas-rce', 'tph-rce-trn', 'Supervisor training', 'high', 2),
  ('ttsk-rce-036', 'tmpl-ccaas-rce', 'tph-rce-trn', 'Admin & reporting training', 'high', 3),
  ('ttsk-rce-037', 'tmpl-ccaas-rce', 'tph-rce-trn', 'Training materials delivery', 'medium', 4),
  -- Go-Live
  ('ttsk-rce-038', 'tmpl-ccaas-rce', 'tph-rce-gl', 'Cutover execution', 'high', 1),
  ('ttsk-rce-039', 'tmpl-ccaas-rce', 'tph-rce-gl', 'Go-live monitoring', 'high', 2),
  ('ttsk-rce-040', 'tmpl-ccaas-rce', 'tph-rce-gl', 'Agent support coverage', 'high', 3),
  ('ttsk-rce-041', 'tmpl-ccaas-rce', 'tph-rce-gl', 'Post-cutover verification', 'high', 4),
  -- Hypercare
  ('ttsk-rce-042', 'tmpl-ccaas-rce', 'tph-rce-hc', 'Daily check-ins week 1', 'high', 1),
  ('ttsk-rce-043', 'tmpl-ccaas-rce', 'tph-rce-hc', 'Issue tracking & resolution', 'high', 2),
  ('ttsk-rce-044', 'tmpl-ccaas-rce', 'tph-rce-hc', 'Performance review', 'medium', 3),
  ('ttsk-rce-045', 'tmpl-ccaas-rce', 'tph-rce-hc', 'Hypercare close-out', 'medium', 4);

-- ── Template 5: Zoom Revenue Accelerator ────────────────────────────────────

INSERT INTO templates (id, name, solution_type, description) VALUES
  ('tmpl-zoom-ra', 'Zoom Revenue Accelerator', 'zoom_ra', 'Zoom Revenue Accelerator deployment & enablement');

INSERT INTO template_phases (id, template_id, name, order_index) VALUES
  ('tph-zra-disc', 'tmpl-zoom-ra', 'Discovery',                   1),
  ('tph-zra-cfg',  'tmpl-zoom-ra', 'Configuration',               2),
  ('tph-zra-int',  'tmpl-zoom-ra', 'Integration & Enablement',    3),
  ('tph-zra-gl',   'tmpl-zoom-ra', 'Go-Live',                     4);

INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index) VALUES
  -- Discovery
  ('ttsk-zra-001', 'tmpl-zoom-ra', 'tph-zra-disc', 'Project kickoff', 'high', 1),
  ('ttsk-zra-002', 'tmpl-zoom-ra', 'tph-zra-disc', 'CRM & tech stack discovery', 'high', 2),
  ('ttsk-zra-003', 'tmpl-zoom-ra', 'tph-zra-disc', 'Sales process & use case mapping', 'medium', 3),
  ('ttsk-zra-004', 'tmpl-zoom-ra', 'tph-zra-disc', 'User & team structure review', 'medium', 4),
  ('ttsk-zra-005', 'tmpl-zoom-ra', 'tph-zra-disc', 'Success metrics definition', 'medium', 5),
  -- Configuration
  ('ttsk-zra-006', 'tmpl-zoom-ra', 'tph-zra-cfg', 'ZRA tenant provisioning', 'high', 1),
  ('ttsk-zra-007', 'tmpl-zoom-ra', 'tph-zra-cfg', 'User provisioning & licensing', 'high', 2),
  ('ttsk-zra-008', 'tmpl-zoom-ra', 'tph-zra-cfg', 'Team & hierarchy configuration', 'medium', 3),
  ('ttsk-zra-009', 'tmpl-zoom-ra', 'tph-zra-cfg', 'Conversation intelligence settings', 'medium', 4),
  ('ttsk-zra-010', 'tmpl-zoom-ra', 'tph-zra-cfg', 'Custom tracker & keyword setup', 'medium', 5),
  -- Integration & Enablement
  ('ttsk-zra-011', 'tmpl-zoom-ra', 'tph-zra-int', 'CRM integration (Salesforce/HubSpot)', 'high', 1),
  ('ttsk-zra-012', 'tmpl-zoom-ra', 'tph-zra-int', 'Calendar & conferencing integration', 'medium', 2),
  ('ttsk-zra-013', 'tmpl-zoom-ra', 'tph-zra-int', 'SSO configuration', 'medium', 3),
  ('ttsk-zra-014', 'tmpl-zoom-ra', 'tph-zra-int', 'Admin training', 'high', 4),
  ('ttsk-zra-015', 'tmpl-zoom-ra', 'tph-zra-int', 'Sales rep onboarding & training', 'medium', 5),
  ('ttsk-zra-016', 'tmpl-zoom-ra', 'tph-zra-int', 'Playbook & coaching workflow setup', 'medium', 6),
  -- Go-Live
  ('ttsk-zra-017', 'tmpl-zoom-ra', 'tph-zra-gl', 'Go-live execution', 'high', 1),
  ('ttsk-zra-018', 'tmpl-zoom-ra', 'tph-zra-gl', 'Post-launch monitoring', 'medium', 2),
  ('ttsk-zra-019', 'tmpl-zoom-ra', 'tph-zra-gl', 'Adoption baseline measurement', 'medium', 3),
  ('ttsk-zra-020', 'tmpl-zoom-ra', 'tph-zra-gl', 'Hypercare close-out', 'medium', 4);
