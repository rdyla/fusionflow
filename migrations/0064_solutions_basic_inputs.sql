-- Replace basic-mode tier-table pricing with a formula-driven calculator.
-- The single basic_seat_count integer becomes a richer JSON object capturing
-- every input the new formula reads:
--   users              — drives 0.05h/user scaling (no longer capped at 100)
--   sites              — 1 base, +2h per additional site
--   go_lives           — 1 base, +6h per additional go-live event
--   training_sessions  — flat $290 each
--   onsite_sites       — +2h labour per site we travel to (covers travel)
--   onsite_devices     — flat $36.25 per device we physically install
--
-- After labour + training + device install, PM is added on as 15% of the
-- subtotal (computed at render time, not stored).
--
-- Backfill from existing basic_seat_count where present so solutions
-- already in basic mode keep their seat count and get safe defaults for
-- the new fields. basic_seat_count column is preserved for one release as
-- a safety net; will be dropped in a follow-up cleanup migration.
ALTER TABLE solutions ADD COLUMN basic_inputs TEXT;

UPDATE solutions
SET basic_inputs = json_object(
  'users',             COALESCE(basic_seat_count, 0),
  'sites',             1,
  'go_lives',          1,
  'training_sessions', 0,
  'onsite_sites',      0,
  'onsite_devices',    0
)
WHERE basic_seat_count IS NOT NULL;
