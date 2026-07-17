-- MedVet custom plan (throwaway, see 0129/0130): task-to-task dependencies.
-- Asana-style: `item_id` is "blocked by" `depends_on_item_id` until that task is
-- completed. Soft enforcement — surfaced in the UI (indicator + completion
-- warning), not gated server-side. Both endpoints cascade-delete with their
-- plan item, so deleting a task cleans up any dependency edges touching it.
CREATE TABLE IF NOT EXISTS custom_plan_deps (
  item_id            TEXT NOT NULL REFERENCES custom_plan_items(id) ON DELETE CASCADE,
  depends_on_item_id TEXT NOT NULL REFERENCES custom_plan_items(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, depends_on_item_id)
);
CREATE INDEX IF NOT EXISTS idx_custom_plan_deps_item ON custom_plan_deps(item_id);
CREATE INDEX IF NOT EXISTS idx_custom_plan_deps_dep ON custom_plan_deps(depends_on_item_id);
