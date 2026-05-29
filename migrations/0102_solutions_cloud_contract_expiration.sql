-- Solutions now carry a cloud_contract_expiration_date used to populate the
-- D365 opportunity's am_cloudcontractexpiration field. Free-form ISO date
-- (YYYY-MM-DD) — the SA enters it on the solution detail page when known
-- (typical case: existing customer with a known cloud-contract end date),
-- otherwise left null and sales ops fills in D365 directly.
--
-- Companion to 0101 which added is_new_logo + deal_registration_id; this
-- and the syncOpportunityFromSolution() helper push everything sales ops
-- needs onto the bound opportunity in one PATCH.
ALTER TABLE solutions ADD COLUMN cloud_contract_expiration_date TEXT;
