-- Add AE user assignment to optimize accounts
ALTER TABLE optimize_accounts ADD COLUMN ae_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
