-- ────────────────────────────────────────────────────────────────────────────
-- Normalize free-text projects.vendor values into the canonical enum used by
-- src/shared/vendors.ts. Historical rows accumulated variants ("Ring Central",
-- "RingCentral, Inc.", "Zoom Phone", etc.) because the project-create form
-- used a free-text input. The form is now a <select> bound to VENDOR_KEYS,
-- but legacy rows still need to be folded down to the canonical keys so
-- platform-detection branches (Zoom vs RingCentral tabs, Optimize utilization,
-- etc.) behave consistently.
--
-- Matching is substring-based on a stripped form: LOWER + remove spaces,
-- dashes, underscores, dots, commas — same rule the TS canonicalizer uses.
-- Each UPDATE is gated by a "not already canonical" guard so the migration
-- is safe to re-run.
-- ────────────────────────────────────────────────────────────────────────────

-- Compact helper: strip whitespace/punctuation, lowercase. SQLite has no
-- regex out of the box, so we chain REPLACE/LOWER. The result is compared
-- with INSTR to substring-match.
--   normalized = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
--                  vendor, ' ', ''), '-', ''), '_', ''), '.', ''), ',', ''), '/', ''))

UPDATE projects
SET    vendor = 'ringcentral'
WHERE  vendor IS NOT NULL
  AND  vendor != 'ringcentral'
  AND  (INSTR(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(vendor, ' ', ''), '-', ''), '_', ''), '.', ''), ',', ''), '/', '')), 'ringcentral') > 0
       OR LOWER(TRIM(vendor)) = 'rc');

UPDATE projects
SET    vendor = 'zoom'
WHERE  vendor IS NOT NULL
  AND  vendor != 'zoom'
  AND  INSTR(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(vendor, ' ', ''), '-', ''), '_', ''), '.', ''), ',', ''), '/', '')), 'zoom') > 0;

UPDATE projects
SET    vendor = 'microsoft_teams'
WHERE  vendor IS NOT NULL
  AND  vendor != 'microsoft_teams'
  AND  (INSTR(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(vendor, ' ', ''), '-', ''), '_', ''), '.', ''), ',', ''), '/', '')), 'teams') > 0
       OR INSTR(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(vendor, ' ', ''), '-', ''), '_', ''), '.', ''), ',', ''), '/', '')), 'microsoft') > 0);

UPDATE projects
SET    vendor = 'webex'
WHERE  vendor IS NOT NULL
  AND  vendor != 'webex'
  AND  (INSTR(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(vendor, ' ', ''), '-', ''), '_', ''), '.', ''), ',', ''), '/', '')), 'webex') > 0
       OR INSTR(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(vendor, ' ', ''), '-', ''), '_', ''), '.', ''), ',', ''), '/', '')), 'cisco') > 0);

UPDATE projects
SET    vendor = '8x8'
WHERE  vendor IS NOT NULL
  AND  vendor != '8x8'
  AND  INSTR(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(vendor, ' ', ''), '-', ''), '_', ''), '.', ''), ',', ''), '/', '')), '8x8') > 0;

UPDATE projects
SET    vendor = 'mitel'
WHERE  vendor IS NOT NULL
  AND  vendor != 'mitel'
  AND  INSTR(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(vendor, ' ', ''), '-', ''), '_', ''), '.', ''), ',', ''), '/', '')), 'mitel') > 0;

UPDATE projects
SET    vendor = 'shoretel'
WHERE  vendor IS NOT NULL
  AND  vendor != 'shoretel'
  AND  INSTR(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(vendor, ' ', ''), '-', ''), '_', ''), '.', ''), ',', ''), '/', '')), 'shoretel') > 0;

UPDATE projects
SET    vendor = 'vonage'
WHERE  vendor IS NOT NULL
  AND  vendor != 'vonage'
  AND  INSTR(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(vendor, ' ', ''), '-', ''), '_', ''), '.', ''), ',', ''), '/', '')), 'vonage') > 0;

UPDATE projects
SET    vendor = 'tbd'
WHERE  vendor IS NOT NULL
  AND  vendor != 'tbd'
  AND  (LOWER(TRIM(vendor)) = 'tba' OR LOWER(TRIM(vendor)) = 'tbd');
