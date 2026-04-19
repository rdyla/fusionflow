export type AppRole = "admin" | "executive" | "pm" | "pf_ae" | "pf_sa" | "pf_csm" | "pf_engineer" | "partner_ae" | "client";

export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  organization_name: string | null;
  role: AppRole;
  is_active: number;
  dynamics_account_id: string | null;
  manager_id: string | null;
  can_open_cases?: boolean; // only set for CRM-derived client sessions
  cs_permission?: "none" | "user" | "power_user"; // cloud support calculator access
}

export interface AuthContext {
  user: AppUser;
  role: AppRole;
  organization: string | null;
}

export type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  ASSETS: Fetcher;
  // Dynamics 365 integration (set via wrangler secret put)
  DYNAMICS_TENANT_ID?: string;
  DYNAMICS_CLIENT_ID?: string;
  DYNAMICS_CLIENT_SECRET?: string;
  // SSO app registration (fusionflow-sso, separate from Dynamics)
  SSO_CLIENT_ID?: string;
  SSO_CLIENT_SECRET?: string;
  // Zoom org-level S2S OAuth (set via wrangler secret put)
  ZOOM_ORG_ACCOUNT_ID?: string;
  ZOOM_ORG_CLIENT_ID?: string;
  ZOOM_ORG_CLIENT_SECRET?: string;
  // Email (set via wrangler secret put RESEND_API_KEY)
  RESEND_API_KEY?: string;
  // Apollo.io prospecting API key
  APOLLO_API_KEY?: string;
  // Anthropic API key for AI content generation
  ANTHROPIC_API_KEY?: string;
  // App base URL for email links (set in wrangler.json vars)
  APP_URL?: string;
  // Dev override: when set, ALL outbound emails are redirected to this address
  // Remove this var from wrangler.json when going to production
  DEV_EMAIL?: string;
  // Zoom Team Chat incoming webhook URL for the SA channel (JSON payload, URL-gated)
  ZOOM_CHAT_WEBHOOK_URL?: string;
  // Zoom Custom App webhook + shared secret for support-case notifications (HMAC-signed)
  ZOOM_WEBHOOK_URL?: string;
  ZOOM_WEBHOOK_SECRET?: string;
};

export type Variables = {
  auth: AuthContext;
};