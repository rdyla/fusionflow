-- Two SOW-affecting flags on solutions:
--
-- is_budgetary       — when 1, the SOW renders a diagonal "BUDGETARY"
--                      watermark on each page, and the solution detail
--                      surfaces a "BUDGETARY ONLY" banner. Used for
--                      pre-contract quotes that should not be mistaken
--                      for the firm SOW.
--
-- is_zoom_reseller   — when 1, the SOW cover-page legal blurb references
--                      the Packet Fusion ZOOM SERVICES RESELLER CUSTOMER
--                      AGREEMENT instead of the Packet Fusion Master
--                      Services Agreement. Required for SLED + other
--                      Zoom-reseller-channel deals.
--
-- Both flags are independent (a budgetary SLED quote sets both).

ALTER TABLE solutions ADD COLUMN is_budgetary INTEGER NOT NULL DEFAULT 0;
ALTER TABLE solutions ADD COLUMN is_zoom_reseller INTEGER NOT NULL DEFAULT 0;
