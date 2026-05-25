-- Per-project SharePoint folder URL.
--
-- When a project is created, the server attempts to create a named subfolder
-- under the customer's SharePoint root (customers.sharepoint_url) and saves
-- the resulting absolute URL here. The SharePoint tab on the project page
-- uses this URL as its root — that's where discovery workbooks, customer
-- phone bills, CSRs etc. get uploaded.
--
-- NULL on:
--   - Projects created before this feature (existing rows). The SharePoint
--     tab shows a "Create project folder" button to backfill.
--   - Projects whose customer has no sharepoint_url set. Backfill blocked
--     until the customer's SP root is configured.
--   - Projects where folder creation failed (Graph error). PM can retry via
--     the same "Create project folder" button.

ALTER TABLE projects ADD COLUMN sharepoint_folder_url TEXT;
