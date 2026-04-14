-- Add vendor AE fields to solutions (the Zoom/RingCentral/etc. vendor account executive)
ALTER TABLE solutions ADD COLUMN vendor_ae_user_id TEXT REFERENCES users(id);
ALTER TABLE solutions ADD COLUMN vendor_ae_name TEXT;
ALTER TABLE solutions ADD COLUMN vendor_ae_email TEXT;
