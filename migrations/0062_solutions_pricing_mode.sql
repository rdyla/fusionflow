-- Pricing mode for solutions: 'advanced' (default — current per-workstream
-- labor calc) or 'basic' (UCaaS-only stepped pricing by seat count). Marketing
-- pushback was that the advanced calc is too complex for sub-100-seat UCaaS
-- deals; basic mode collapses pricing to the Excel ladder used today
-- (≤25 = $4,500, ≤50 = $5,400, ≤100 = $6,250).
--
-- basic_seat_count is only meaningful when pricing_mode = 'basic'. The price
-- is derived at compute time from the seat count via getUcaasBasicTier(),
-- not stored — keeps the rate table editable in code without a data migration.
ALTER TABLE solutions ADD COLUMN pricing_mode TEXT NOT NULL DEFAULT 'advanced';
ALTER TABLE solutions ADD COLUMN basic_seat_count INTEGER;
