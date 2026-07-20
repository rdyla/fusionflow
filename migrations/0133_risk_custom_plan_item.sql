-- MedVet throwaway (see 0129): let a blocker (risk) link to a CUSTOM plan task
-- instead of a standard task. Standard blockers use risks.task_id → tasks(id);
-- custom-plan projects keep their tasks in custom_plan_items, so this adds a
-- parallel optional link. A blocker uses one or the other (never both).
ALTER TABLE risks ADD COLUMN custom_plan_item_id TEXT REFERENCES custom_plan_items(id) ON DELETE SET NULL;
