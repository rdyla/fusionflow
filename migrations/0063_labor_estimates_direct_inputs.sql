-- Direct inputs for the labor calculator. When set, the estimate engine
-- prefers these values over the per-type needs_assessments.answers row,
-- letting the user generate a calc-driven estimate without ever touching
-- the needs assessment.
--
-- Same shape as needs_assessments.answers: a JSON object keyed by the
-- field names the calc engine reads (e.g. user_count_band, deployment_type,
-- integrations_required). NULL means "fall back to the NA, then to {}"
-- (existing behaviour).
ALTER TABLE labor_estimates ADD COLUMN direct_inputs TEXT;
