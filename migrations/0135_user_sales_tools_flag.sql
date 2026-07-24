-- Additive flag granting access to the standalone Sales Tools module
-- (Commissions Calculator, Zoom Resell, Zoom Agency tabs). Admin-granted,
-- independent of role, per the app's existing boolean-flag convention.
ALTER TABLE users ADD COLUMN is_sales_tools INTEGER NOT NULL DEFAULT 0;
