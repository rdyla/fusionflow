-- "Available as PM" flag. Distinct from is_project_resource (which makes a user
-- assignable as PM *or* Implementation Engineer); this one is PM-only, so an
-- admin can be PM-eligible without also showing up as an engineer option.
ALTER TABLE users ADD COLUMN is_pm_eligible INTEGER NOT NULL DEFAULT 0;
