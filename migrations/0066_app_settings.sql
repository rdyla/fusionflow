-- Generic key/value table for app-wide settings.
-- Currently used for the "demo mode" lens (vendor: zoom | ringcentral | NULL),
-- which silently filters portfolio-wide list views to a single vendor for
-- partner demos. Singleton-style usage but the schema generalizes to other
-- runtime-configurable settings later.

CREATE TABLE app_settings (
  key                 TEXT PRIMARY KEY,
  value               TEXT,
  updated_at          TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id  TEXT
);
