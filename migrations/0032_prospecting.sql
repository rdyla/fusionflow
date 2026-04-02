-- Prospect lists (one per upload/campaign)
CREATE TABLE IF NOT EXISTS prospect_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  created_by_id TEXT NOT NULL REFERENCES users(id),
  domain_count INTEGER NOT NULL DEFAULT 0,
  enriched_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prospect_lists_owner ON prospect_lists(owner_id);
CREATE INDEX IF NOT EXISTS idx_prospect_lists_created ON prospect_lists(created_at DESC);

-- One prospect row per domain
CREATE TABLE IF NOT EXISTS prospects (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES prospect_lists(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  company_name TEXT,
  industry TEXT,
  employee_count INTEGER,
  annual_revenue_printed TEXT,
  description TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  founded_year INTEGER,
  website_url TEXT,
  linkedin_url TEXT,
  logo_url TEXT,
  technologies TEXT,
  uc_provider TEXT,
  cc_provider TEXT,
  score INTEGER,
  tier TEXT,
  apollo_org_id TEXT,
  why_now TEXT,
  company_challenges TEXT,
  proposed_solution TEXT,
  store_rationale TEXT,
  email_sequence TEXT,
  talk_track TEXT,
  linkedin_inmail TEXT,
  enrichment_status TEXT NOT NULL DEFAULT 'pending',
  ai_status TEXT NOT NULL DEFAULT 'none',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prospects_list ON prospects(list_id);
CREATE INDEX IF NOT EXISTS idx_prospects_tier ON prospects(list_id, tier);

-- Contacts at prospect companies (from Apollo people search)
CREATE TABLE IF NOT EXISTS prospect_contacts (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  apollo_id TEXT,
  first_name TEXT,
  last_name TEXT,
  title TEXT,
  email TEXT,
  phone TEXT,
  linkedin_url TEXT,
  seniority TEXT,
  is_top_contact INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prospect_contacts_prospect ON prospect_contacts(prospect_id);
