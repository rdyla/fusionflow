-- Persist the rendered HTML body of each meeting-prep send so non-editors
-- (partner_ae, executives, etc.) can review what was sent without being
-- able to send a new one themselves.

ALTER TABLE meeting_prep_sends ADD COLUMN body_html TEXT;
