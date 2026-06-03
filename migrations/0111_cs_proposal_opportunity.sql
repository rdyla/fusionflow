-- Cloud Support proposals now create a D365 opportunity (PFI CloudCare) on
-- first version save, mirroring how solutions bind to an opportunity. Track
-- the bound opp id so subsequent saves update it instead of creating dupes.

ALTER TABLE cs_proposals ADD COLUMN crm_opportunity_id TEXT;
