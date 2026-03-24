-- Add solution back-reference to projects (many projects can belong to one solution)
ALTER TABLE projects ADD COLUMN solution_id TEXT REFERENCES solutions(id);
CREATE INDEX IF NOT EXISTS idx_projects_solution_id ON projects(solution_id);

-- Backfill: projects previously created via handoff already have solutions pointing to them
UPDATE projects
SET solution_id = (
  SELECT s.id FROM solutions s WHERE s.linked_project_id = projects.id LIMIT 1
)
WHERE solution_id IS NULL
  AND EXISTS (SELECT 1 FROM solutions s WHERE s.linked_project_id = projects.id);
