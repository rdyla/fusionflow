-- Add manager_id to users for AE reporting hierarchy
ALTER TABLE users ADD COLUMN manager_id TEXT REFERENCES users(id);
