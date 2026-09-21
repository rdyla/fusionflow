-- Structured closeout notes a PM fills in for customer-facing closeout
-- meetings (CSM/sales review these to prep, per Kevin's request). Modeled
-- after a real "Project summary and closeout" deck: team, what was
-- deployed, what was delivered, and a finalization summary. Go-live date
-- is NOT duplicated here — it's read live from projects.actual_go_live_date.
ALTER TABLE projects ADD COLUMN closeout_team TEXT;
ALTER TABLE projects ADD COLUMN closeout_solution TEXT;
ALTER TABLE projects ADD COLUMN closeout_delivered TEXT;
ALTER TABLE projects ADD COLUMN closeout_summary TEXT;
ALTER TABLE projects ADD COLUMN closeout_notes_updated_at TEXT;
ALTER TABLE projects ADD COLUMN closeout_notes_updated_by_user_id TEXT REFERENCES users(id);
