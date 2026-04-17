-- Formalizes a column added to production manually before migration tracking existed.
-- Ensures fresh databases have dynamics_account_id before migration 0033 runs.
ALTER TABLE projects ADD COLUMN dynamics_account_id TEXT;
