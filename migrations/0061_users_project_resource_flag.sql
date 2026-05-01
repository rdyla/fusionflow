-- Project resource flag: an additive permission letting any internal user be
-- assignable to a project as an Implementation Engineer or Project Manager,
-- regardless of their primary role. Use case: an admin or AE who occasionally
-- functions as a project engineer needs to appear in the staff-picker dropdown
-- without changing their actual role. Defaults to 0; clients should never have
-- this set.
ALTER TABLE users ADD COLUMN is_project_resource INTEGER NOT NULL DEFAULT 0;
