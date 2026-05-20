-- Add a `is_go_live_event` flag to template_tasks so the Timeline Builder can
-- anchor a project's target go-live date to a specific task (the cutover
-- event) rather than the end of the last phase.
--
-- Each template flags exactly one task. For UCaaS Zoom this is the existing
-- "Go Live Event" task; for the rest we flag the closest cutover-style task.
-- ZCC's Go-Live phase only had a post-cutover verification task ("Test DIDs..."),
-- so we add a real "Go Live Event" task and flag it.
--
-- Algorithm consequence: the flagged task's END date becomes the project's
-- target go-live; earlier phases chain backward, later phases (Closing,
-- Hypercare) chain forward.

ALTER TABLE template_tasks ADD COLUMN is_go_live_event INTEGER NOT NULL DEFAULT 0;

-- ── ZCC: add the missing "Go Live Event" task before the existing verification task
UPDATE template_tasks SET order_index = 2 WHERE id = 'ttsk-czcc-164';
INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index, default_assignee_role, is_go_live_event) VALUES
  ('ttsk-czcc-165', 'tmpl-ccaas-zcc', 'tph-czcc-gl', 'Go Live Event', 'high', 1, 'all', 1);

-- ── Flag the canonical go-live event in every other template ────────────────
-- UCaaS Zoom: existing "Go Live Event" task
UPDATE template_tasks SET is_go_live_event = 1 WHERE id = 'ttsk-uzoom-504';

-- UCaaS RingCentral: "Cutover Execution"
UPDATE template_tasks SET is_go_live_event = 1 WHERE id = 'ttsk-urc-234';

-- CCaaS RC Engage: "Cutover Execution"
UPDATE template_tasks SET is_go_live_event = 1 WHERE id = 'ttsk-rce-238';

-- Zoom Revenue Accelerator (CI): "Go-Live Execution"
UPDATE template_tasks SET is_go_live_event = 1 WHERE id = 'ttsk-zra-217';

-- VA: "Production Cutover"
UPDATE template_tasks SET is_go_live_event = 1 WHERE id = 'ttsk-va-017';

-- WFM: "Production Cutover"
UPDATE template_tasks SET is_go_live_event = 1 WHERE id = 'ttsk-wfm-017';

-- QM: "Production Cutover"
UPDATE template_tasks SET is_go_live_event = 1 WHERE id = 'ttsk-qm-017';
