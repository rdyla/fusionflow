-- MedVet custom plan (throwaway, see 0129): make the assignee a REAL assignment
-- so it fires task-assigned notifications and appears in the assignee's My Tasks,
-- matching the standard tasks module. The free-text `assignee` column stays as
-- the imported Asana label / display fallback; these add the real references.
ALTER TABLE custom_plan_items ADD COLUMN assignee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE custom_plan_items ADD COLUMN assignee_contact_id TEXT REFERENCES project_contacts(id) ON DELETE SET NULL;
