-- Add dynamics_account_id to users for client role CRM account linkage
ALTER TABLE users ADD COLUMN dynamics_account_id TEXT;
