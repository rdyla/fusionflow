-- Support supervisor flag: an additive permission (not a role) granting access
-- to the supervisor-only digest email feature. Any internal user can be granted
-- it; clients (role = 'client') should never have this set.
ALTER TABLE users ADD COLUMN is_support_supervisor INTEGER NOT NULL DEFAULT 0;
