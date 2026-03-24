-- Add SA and CSM to solutions
ALTER TABLE solutions ADD COLUMN pf_sa_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE solutions ADD COLUMN pf_csm_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
