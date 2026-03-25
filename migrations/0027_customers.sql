-- ── Customers: Central Entity ───────────────────────────────────────────────
-- Customers own their PF team, contacts, provider AEs, SharePoint link, and
-- all journeys (Solutions, Implementations, Optimizations).

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  crm_account_id TEXT NOT NULL,            -- Dynamics 365 account GUID (required)
  sharepoint_url TEXT,
  pf_ae_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  pf_sa_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  pf_csm_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_customers_crm_account_id ON customers(crm_account_id);

-- Customer contacts (replaces per-solution and per-project contact tables)
CREATE TABLE customer_contacts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  dynamics_contact_id TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  job_title TEXT,
  contact_role TEXT,
  added_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_contacts_customer_id ON customer_contacts(customer_id);

-- Provider AEs: one per vendor relationship (Zoom AE, Rapidscale AE, etc.)
CREATE TABLE customer_provider_aes (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  added_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_provider_aes_customer_id ON customer_provider_aes(customer_id);

-- Add customer_id FK to all journey tables
ALTER TABLE solutions ADD COLUMN customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE optimize_accounts ADD COLUMN customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL;
