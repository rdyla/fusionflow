-- Add meeting-level shareable link from Zoom API
ALTER TABLE zoom_recordings ADD COLUMN share_url TEXT;
