-- User-editable profile fields.
--
-- name + avatar_url already existed (avatar_url is currently populated from
-- Zoom S2S OAuth for internal staff with @packetfusion.com emails). The
-- new fields support partner AEs / external users who don't have Zoom
-- profiles, plus internal users who want to override their Zoom default.
--
--   phone           — display-only phone number (any format), shown on
--                     meeting prep emails and dashboard team panel.
--   scheduler_url   — vendor-neutral calendar booking link (Zoom Scheduler
--                     for PF staff, RingCentral's scheduler for some
--                     partners, Calendly for whoever else). Drives the
--                     "Schedule with {PM}" button on the project Dashboard
--                     for client + partner_ae viewers.
--   title           — custom job title to override the role-derived label
--                     (e.g. "Senior Implementation Engineer" vs role's
--                     generic "Engineer").
--   avatar_r2_key   — when set, indicates the user uploaded a custom
--                     avatar stored in R2 at this key. The avatar GET
--                     endpoint streams from R2 when this is set; falls
--                     back to the Zoom-cached avatar_url otherwise.

ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN scheduler_url TEXT;
ALTER TABLE users ADD COLUMN title TEXT;
ALTER TABLE users ADD COLUMN avatar_r2_key TEXT;
