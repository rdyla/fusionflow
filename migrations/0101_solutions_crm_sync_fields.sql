-- Solutions now carry two fields that get synced back to D365 opportunities:
--
--   is_new_logo        — 1 when the SA created the CRM account inline during
--                        New Solution (via /api/dynamics/accounts). Drives
--                        am_revenuesource = New Logo (930680001) on the bound
--                        opportunity; legacy rows default to 0 = Installed Base.
--   deal_registration_id — partner deal-reg id (Zoom / RC vendor portal). Free
--                        text. Maps to cr495_dealregistrationid on the
--                        opportunity. Editable from the solution detail page.
--
-- The actual sync runs in syncOpportunityFromSolution() on every POST/PATCH
-- of /solutions — only when a crm_opportunity_id is bound (added in #287).
ALTER TABLE solutions ADD COLUMN is_new_logo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE solutions ADD COLUMN deal_registration_id TEXT;
