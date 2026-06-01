-- Solution-side SharePoint folders, mirroring the project side.
--
-- Solutions now get their own folder under the customer's SharePoint root
-- (created on solution insert, retrofittable from the SharePoint tab), and
-- SAs/admins can create subfolders + mark them client/partner-visible — the
-- same control projects already have.
--
--  1. solutions.sharepoint_folder_url — the solution's own folder URL (the
--     browsing root on the SharePoint tab). Mirrors projects.sharepoint_folder_url.
--  2. sharepoint_folder_visibility.solution_id — lets a visibility row be
--     scoped to a solution instead of a project. The table is still keyed by
--     the Graph driveItem id (sp_item_id), so the /files filtering is
--     unchanged; solution_id just scopes ownership (cleanup + staging promote).

ALTER TABLE solutions ADD COLUMN sharepoint_folder_url TEXT;

ALTER TABLE sharepoint_folder_visibility ADD COLUMN solution_id TEXT;
CREATE INDEX idx_spfv_solution ON sharepoint_folder_visibility (solution_id);
