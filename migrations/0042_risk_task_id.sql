-- Link blockers to the specific task being blocked
ALTER TABLE risks ADD COLUMN task_id TEXT REFERENCES tasks(id);
