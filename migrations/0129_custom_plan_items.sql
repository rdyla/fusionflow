-- ONE-OFF, THROWAWAY feature for the MedVet Zoom project: a bespoke Timeline +
-- Tasks plan that mirrors the customer's original Asana project exactly (sections
-- as "stages", a 3-level task outline, module tags). Standard stages/tasks don't
-- support that nesting; rather than complicate the shared modules, this project's
-- Timeline/Tasks tabs render a self-contained clone backed by this table.
--
-- TEARDOWN when the project closes: drop this table, drop projects.uses_custom_plan,
-- delete the customPlan route + CustomPlan* client components + the medvetPlan.json
-- asset. Nothing else references it.
CREATE TABLE custom_plan_items (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section     TEXT NOT NULL,                 -- the Asana section == a "stage"
  parent_id   TEXT REFERENCES custom_plan_items(id) ON DELETE CASCADE,  -- nesting within a section
  depth       INTEGER NOT NULL DEFAULT 0,    -- 0 task / 1 subtask / 2 child
  sort_order  INTEGER NOT NULL DEFAULT 0,
  name        TEXT NOT NULL,
  module      TEXT,                          -- Asana Module tag (UCaaS / CCaaS / …)
  start_date  TEXT,                          -- YYYY-MM-DD
  due_date    TEXT,
  status      TEXT NOT NULL DEFAULT 'not_started',
  assignee    TEXT,                          -- Asana "Assigned To" label (free text)
  notes       TEXT,
  created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_custom_plan_project ON custom_plan_items(project_id, sort_order);

-- Opt-in flag: when 1, this project's Timeline + Tasks tabs render the custom plan.
ALTER TABLE projects ADD COLUMN uses_custom_plan INTEGER NOT NULL DEFAULT 0;
