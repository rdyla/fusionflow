-- Add journeys column to solutions: stores a JSON array of journey keys
-- e.g. ["zoom_ucaas","zoom_ccaas","zoom_zva"]
ALTER TABLE solutions ADD COLUMN journeys TEXT;
