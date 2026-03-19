-- Add Asana integration fields to projects
ALTER TABLE projects ADD COLUMN asana_project_id TEXT;
ALTER TABLE projects ADD COLUMN managed_in_asana INTEGER DEFAULT 0;
