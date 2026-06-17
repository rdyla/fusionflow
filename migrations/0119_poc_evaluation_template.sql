-- UCaaS POC / Evaluation template — a pre-sales evaluation engagement laid out
-- as a 5-stage timeline (Discovery & POC Build → Iterative Solutioning &
-- Testing → End-User Testing & Sign-off → Official Vendor Demonstrations →
-- Decision Window). Modeled on the "Stanford UCaaS POC — Project Gantt"
-- engagement plan: each row is an Activity with an Owner; we drop the Gantt
-- bars and keep Activity + Owner, with each stage's span captured as
-- working_days so the Timeline Builder can chain real dates from a chosen
-- anchor.
--
-- Reusable / blank: activity titles and owner roles are generic (no customer
-- or person names). A PM applies it to a project, picks the anchor date, and
-- fills specifics per engagement.
--
-- Owner → default_assignee_role mapping (allowed: pm | ie | pf | customer |
-- all | zoom_porting | customer/ie):
--   PF-driven (SA / engagement)        → pf
--   PM coordination (kickoff, SOW)     → pm
--   Joint PF + customer technical      → all
--   Customer-led (Stanford SU/SHC)     → customer
--
-- Anchor: "Packet Fusion delivery complete" (end of Stage D) is flagged as the
-- go-live event — it's PF's committed deliverable date. Earlier stages chain
-- backward from it; the customer-led Decision Window (Stage E) chains forward.
--
-- working_days per stage are Mon–Fri days across each stage's span in the
-- source plan (Stage C overlaps B and Stage D overlaps C in the real calendar;
-- the Timeline Builder chains stages sequentially, so applied dates run longer
-- than a maximally-overlapped plan — PMs tighten per engagement).

-- ── Template ────────────────────────────────────────────────────────────────
INSERT INTO templates (id, name, solution_type, description) VALUES
  ('tmpl-ucaas-poc', 'UCaaS POC / Evaluation', 'ucaas', 'Pre-sales UCaaS proof-of-concept & vendor evaluation engagement');

-- ── Stages (5, working_days seeded inline) ──────────────────────────────────
INSERT INTO template_stages (id, template_id, name, order_index, working_days) VALUES
  ('tph-poc-disc', 'tmpl-ucaas-poc', 'Discovery & POC Build',          1, 19),
  ('tph-poc-iter', 'tmpl-ucaas-poc', 'Iterative Solutioning & Testing', 2, 25),
  ('tph-poc-uat',  'tmpl-ucaas-poc', 'End-User Testing & Sign-off',     3, 15),
  ('tph-poc-demo', 'tmpl-ucaas-poc', 'Official Vendor Demonstrations',  4, 10),
  ('tph-poc-dec',  'tmpl-ucaas-poc', 'Decision Window',                 5, 17);

-- ── Tasks (Activity rows; one go-live event flagged) ────────────────────────
-- Stage A — Discovery & POC Build
INSERT INTO template_tasks (id, template_id, stage_id, title, priority, order_index, default_assignee_role, is_go_live_event) VALUES
  ('ttsk-poc-001', 'tmpl-ucaas-poc', 'tph-poc-disc', 'Engagement startup (NDA, SOW, kickoff)',       'high',   1, 'pm',       0),
  ('ttsk-poc-002', 'tmpl-ucaas-poc', 'tph-poc-disc', 'Requirements ingestion & synthesis',           'high',   2, 'pf',       0),
  ('ttsk-poc-003', 'tmpl-ucaas-poc', 'tph-poc-disc', 'Customer environment focused analysis',        'high',   3, 'pf',       0),
  ('ttsk-poc-004', 'tmpl-ucaas-poc', 'tph-poc-disc', 'Customer environment review',                  'medium', 4, 'all',      0),
  ('ttsk-poc-005', 'tmpl-ucaas-poc', 'tph-poc-disc', 'Evaluation criteria & scoring framework',      'high',   5, 'pf',       0),
  ('ttsk-poc-006', 'tmpl-ucaas-poc', 'tph-poc-disc', 'Vendor POC team engagement',                   'high',   6, 'pf',       0),
  ('ttsk-poc-007', 'tmpl-ucaas-poc', 'tph-poc-disc', 'POC environment builds',                       'high',   7, 'pf',       0),
  ('ttsk-poc-008', 'tmpl-ucaas-poc', 'tph-poc-disc', 'POC handoff to customer teams',                'high',   8, 'pf',       0);

-- Stage B — Iterative Solutioning & Testing
INSERT INTO template_tasks (id, template_id, stage_id, title, priority, order_index, default_assignee_role, is_go_live_event) VALUES
  ('ttsk-poc-009', 'tmpl-ucaas-poc', 'tph-poc-iter', 'Use case list finalized',                      'high',   1, 'customer', 0),
  ('ttsk-poc-010', 'tmpl-ucaas-poc', 'tph-poc-iter', 'Iterative solutioning cycles (both platforms)','high',   2, 'pf',       0),
  ('ttsk-poc-011', 'tmpl-ucaas-poc', 'tph-poc-iter', 'Vendor POC coordination (daily standup)',      'medium', 3, 'pf',       0),
  ('ttsk-poc-012', 'tmpl-ucaas-poc', 'tph-poc-iter', 'Validation logging',                           'medium', 4, 'pf',       0),
  ('ttsk-poc-013', 'tmpl-ucaas-poc', 'tph-poc-iter', 'Gap analysis & escalation',                    'high',   5, 'pf',       0);

-- Stage C — End-User Testing & Sign-off
INSERT INTO template_tasks (id, template_id, stage_id, title, priority, order_index, default_assignee_role, is_go_live_event) VALUES
  ('ttsk-poc-014', 'tmpl-ucaas-poc', 'tph-poc-uat',  'End-user testing program',                     'high',   1, 'customer', 0),
  ('ttsk-poc-015', 'tmpl-ucaas-poc', 'tph-poc-uat',  'Feedback capture & synthesis',                 'medium', 2, 'pf',       0),
  ('ttsk-poc-016', 'tmpl-ucaas-poc', 'tph-poc-uat',  'Final validation pass (all must-haves)',       'high',   3, 'pf',       0),
  ('ttsk-poc-017', 'tmpl-ucaas-poc', 'tph-poc-uat',  'Solutioning sign-off milestone',               'high',   4, 'customer', 0);

-- Stage D — Official Vendor Demonstrations
INSERT INTO template_tasks (id, template_id, stage_id, title, priority, order_index, default_assignee_role, is_go_live_event) VALUES
  ('ttsk-poc-018', 'tmpl-ucaas-poc', 'tph-poc-demo', 'Demo coordination & content review',           'high',   1, 'pf',       0),
  ('ttsk-poc-019', 'tmpl-ucaas-poc', 'tph-poc-demo', 'Vendor A executive demonstration',             'high',   2, 'pf',       0),
  ('ttsk-poc-020', 'tmpl-ucaas-poc', 'tph-poc-demo', 'Vendor B executive demonstration',             'high',   3, 'pf',       0),
  ('ttsk-poc-021', 'tmpl-ucaas-poc', 'tph-poc-demo', 'Unified scoring matrix (both platforms)',      'high',   4, 'pf',       0),
  ('ttsk-poc-022', 'tmpl-ucaas-poc', 'tph-poc-demo', 'Executive summary document',                   'high',   5, 'pf',       0),
  ('ttsk-poc-023', 'tmpl-ucaas-poc', 'tph-poc-demo', 'Platform Health & Future-Proofing Brief',      'medium', 6, 'pf',       0),
  ('ttsk-poc-024', 'tmpl-ucaas-poc', 'tph-poc-demo', 'Packet Fusion delivery complete',              'high',   7, 'pf',       1);

-- Stage E — Decision Window (customer-led; PF ad-hoc)
INSERT INTO template_tasks (id, template_id, stage_id, title, priority, order_index, default_assignee_role, is_go_live_event) VALUES
  ('ttsk-poc-025', 'tmpl-ucaas-poc', 'tph-poc-dec',  'Customer internal review',                     'medium', 1, 'customer', 0),
  ('ttsk-poc-026', 'tmpl-ucaas-poc', 'tph-poc-dec',  'Pricing, negotiation & final decision window', 'high',   2, 'customer', 0),
  ('ttsk-poc-027', 'tmpl-ucaas-poc', 'tph-poc-dec',  'Leadership go/no-go decision',                 'high',   3, 'customer', 0);
