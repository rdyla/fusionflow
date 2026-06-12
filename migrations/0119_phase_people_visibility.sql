-- Phase-level people + phase-scoped client visibility.
--
-- Lets an overarching project (e.g. LACCD: one project, ~10 campus phases)
-- attach customer contacts and PF staff to individual phases, and restrict a
-- client to only the phases they're attached to. Off by default so existing
-- single-site projects are unaffected.

ALTER TABLE projects ADD COLUMN phase_scoped_visibility INTEGER NOT NULL DEFAULT 0;

-- Customer contacts attached to a phase. phase_id NULL = "All phases" (the
-- college/district tier that sees the whole project).
CREATE TABLE phase_contacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_id TEXT REFERENCES phases(id) ON DELETE CASCADE,
  customer_contact_id TEXT,            -- optional link to customer_contacts.id
  name TEXT NOT NULL,
  email TEXT,
  job_title TEXT,
  contact_role TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_phase_contacts_project ON phase_contacts(project_id);
CREATE INDEX idx_phase_contacts_email   ON phase_contacts(email);

-- PF (internal) staff attached to a phase — assignment/display metadata.
-- Does NOT restrict internal users (they keep portfolio-wide visibility).
CREATE TABLE phase_staff (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_id   TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id),
  staff_role TEXT,                     -- 'ae' | 'sa' | 'csm' | 'engineer' | 'pm'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(phase_id, user_id, staff_role)
);
CREATE INDEX idx_phase_staff_project ON phase_staff(project_id);
