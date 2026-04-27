-- Cloud support proposals: link to a CRM-backed customer when one exists.
-- Both columns are nullable so freeform pricing exercises (no customer yet)
-- still work. customer_name is denormalized for fast list-view rendering
-- without joining cs_versions JSON to extract the form's customerName.
ALTER TABLE cs_proposals ADD COLUMN customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE cs_proposals ADD COLUMN customer_name TEXT;
CREATE INDEX IF NOT EXISTS idx_cs_proposals_customer_id ON cs_proposals(customer_id);
