-- Opportunity fields surfaced on the solution so they can be set at create
-- (New Solution / create-opportunity form) AND edited any time from the
-- solution overview. syncOpportunityFromSolution pushes them to the bound
-- D365 opportunity, mirroring how deal_registration_id /
-- cloud_contract_expiration_date already work.
--
--   revenue_source        — am_revenuesource option-set:
--                             Installed Base 930680000 | New Logo 930680001
--   estimated_close_date  — estimatedclosedate (DateOnly), stored yyyy-MM-dd

ALTER TABLE solutions ADD COLUMN revenue_source INTEGER;
ALTER TABLE solutions ADD COLUMN estimated_close_date TEXT;
