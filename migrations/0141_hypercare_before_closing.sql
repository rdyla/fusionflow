-- Move Hypercare ahead of Closing in the project templates, and drop the
-- duplicated invoicing tasks from Hypercare.
--
-- Requested twice by Jacqui White via the roadmap table (2026-06-12 and again
-- 2026-08-21, the second time after the first went untriaged for ten weeks):
--   "Move Hypercare to before Closing. Close out should be the final stage."
--   "Remove all referenced tasks to invoicing and Zoom invoicing under
--    Hypercare. Leaving the one under closing should suffice."
--
-- Closing is the terminal stage of an engagement, so hypercare running *after*
-- it was backwards on every template that had both.
--
-- TEMPLATES ONLY. Projects already created copied their stages at creation time
-- and are deliberately left alone, so nobody's in-flight project resequences
-- underneath them mid-engagement.

-- 1. Swap the two stages wherever a template has both (7 templates, all of them
--    currently Closing=6, Hypercare=7). Templates carrying Hypercare with no
--    Closing stage (tmpl-ccaas-rce, tmpl-ucaas-rc, tmpl-zoom-ra) are untouched:
--    the subqueries simply don't match them.
UPDATE template_stages
   SET order_index = 7
 WHERE name = 'Closing'
   AND order_index = 6
   AND template_id IN (
         SELECT template_id FROM template_stages WHERE name = 'Hypercare' AND order_index = 7
       );

UPDATE template_stages
   SET order_index = 6
 WHERE name = 'Hypercare'
   AND order_index = 7
   AND template_id IN (
         SELECT template_id FROM template_stages WHERE name = 'Closing' AND order_index = 7
       );

-- 2. Drop the invoicing tasks that sit under Hypercare. Only tmpl-ccaas-zcc has
--    any: "Invoicing" (duplicated from Closing) and "Send Invoice Request by
--    Phase Email to Zoom Billing". The "Invoicing" task under Closing stays —
--    that's the one Jacqui wants kept.
--
--    Scoped to the Hypercare stage so the unrelated invoice tasks elsewhere
--    survive: "Provide Current Copies of Invoices (Toll + Toll-Free DIDs)" in
--    Planning and "Porting Discovery - Receipt of Telco Invoices" in the Zoom
--    tenant-prep stage are discovery inputs, not billing steps.
DELETE FROM template_tasks
 WHERE title LIKE '%nvoic%'
   AND stage_id IN (SELECT id FROM template_stages WHERE name = 'Hypercare');
