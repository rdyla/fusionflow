-- Add health_override to projects table.
-- NULL = auto-computed by scoring engine; non-null = PM manual override.
ALTER TABLE projects ADD COLUMN health_override TEXT;
