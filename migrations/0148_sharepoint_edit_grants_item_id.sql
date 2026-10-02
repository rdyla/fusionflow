-- Key edit grants on the folder's STABLE driveItem id, not just web_url. A
-- rename/move in SharePoint changes web_url but not the item id, so web_url-only
-- rows went stale: the picker showed granted users as ungranted and the external
-- "Edit online" overlay stopped matching. web_url stays (the overlay prefix-
-- matches it for cascade) and is self-healed from the id on folder listings.
ALTER TABLE sharepoint_edit_grants ADD COLUMN sp_item_id TEXT;

CREATE INDEX idx_sp_edit_grants_item ON sharepoint_edit_grants(sp_item_id);

-- Backfill from folder visibility rows (which already carry the id) where the
-- URLs still line up. Unmatched legacy rows keep NULL and fall back to web_url.
UPDATE sharepoint_edit_grants
SET sp_item_id = (
  SELECT v.sp_item_id FROM sharepoint_folder_visibility v
  WHERE v.web_url = sharepoint_edit_grants.web_url
  LIMIT 1
)
WHERE sp_item_id IS NULL;
