const ORG_URL = "https://packetfusioncrm.crm.dynamics.com";
const API_BASE = `${ORG_URL}/api/data/v9.2`;
const TOKEN_CACHE_KEY = "dynamics_token";

type TokenCache = {
  access_token: string;
  expires_at: number; // unix ms
};

export type DynamicsAccount = {
  accountid: string;
  name: string;
  emailaddress1: string | null;
  telephone1: string | null;
  websiteurl: string | null;
  address1_city: string | null;
  address1_stateorprovince: string | null;
};

export type DynamicsContact = {
  contactid: string;
  firstname: string | null;
  lastname: string | null;
  emailaddress1: string | null;
  telephone1: string | null;
  jobtitle: string | null;
};

type Env = {
  KV: KVNamespace;
  DYNAMICS_TENANT_ID?: string;
  DYNAMICS_CLIENT_ID?: string;
  DYNAMICS_CLIENT_SECRET?: string;
};

function isConfigured(env: Env): boolean {
  return !!(env.DYNAMICS_TENANT_ID && env.DYNAMICS_CLIENT_ID && env.DYNAMICS_CLIENT_SECRET);
}

async function getToken(env: Env): Promise<string> {
  // Try cache first
  const cached = await env.KV.get<TokenCache>(TOKEN_CACHE_KEY, "json");
  if (cached && cached.expires_at > Date.now() + 60_000) {
    return cached.access_token;
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.DYNAMICS_CLIENT_ID!,
    client_secret: env.DYNAMICS_CLIENT_SECRET!,
    scope: `${ORG_URL}/.default`,
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${env.DYNAMICS_TENANT_ID}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params }
  );

  if (!res.ok) {
    throw new Error(`Dynamics token fetch failed: ${res.status}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };

  const cache: TokenCache = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  // Cache for slightly less than the token lifetime
  await env.KV.put(TOKEN_CACHE_KEY, JSON.stringify(cache), { expirationTtl: data.expires_in - 60 });

  return data.access_token;
}

async function dynamicsGet<T>(env: Env, path: string): Promise<T> {
  const token = await getToken(env);
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
    },
  });

  if (!res.ok) {
    throw new Error(`Dynamics API error: ${res.status} ${path}`);
  }

  return res.json() as Promise<T>;
}

export async function searchAccounts(env: Env, query: string): Promise<DynamicsAccount[]> {
  if (!isConfigured(env) || !query.trim()) return [];

  const q = query.trim().replace(/'/g, "''"); // escape single quotes for OData
  const select = "accountid,name,emailaddress1,telephone1,websiteurl,address1_city,address1_stateorprovince";
  const filter = `contains(name,'${q}')`;
  const path = `/accounts?$select=${select}&$filter=${filter}&$top=10&$orderby=name asc`;

  const data = await dynamicsGet<{ value: DynamicsAccount[] }>(env, path);
  return data.value ?? [];
}

export async function getAccountContacts(env: Env, accountId: string): Promise<DynamicsContact[]> {
  if (!isConfigured(env)) return [];

  const select = "contactid,firstname,lastname,emailaddress1,telephone1,jobtitle";
  const filter = `_parentcustomerid_value eq ${accountId}`;
  const path = `/contacts?$select=${select}&$filter=${filter}&$top=50&$orderby=lastname asc`;

  const data = await dynamicsGet<{ value: DynamicsContact[] }>(env, path);
  return data.value ?? [];
}

export type DynamicsUser = {
  systemuserid: string;
  firstname: string | null;
  lastname: string | null;
  internalemailaddress: string | null;
  title: string | null;
};

export async function getPacketFusionPMs(env: Env): Promise<DynamicsUser[]> {
  if (!isConfigured(env)) return [];

  const select = "systemuserid,firstname,lastname,internalemailaddress,title";
  const filter = `contains(internalemailaddress,'@packetfusion.com') and isdisabled eq false and contains(title,'Project Manager')`;
  const path = `/systemusers?$select=${select}&$filter=${filter}&$top=50&$orderby=lastname asc`;

  const data = await dynamicsGet<{ value: DynamicsUser[] }>(env, path);
  return data.value ?? [];
}

export async function getPacketFusionAEs(env: Env): Promise<DynamicsUser[]> {
  if (!isConfigured(env)) return [];

  const select = "systemuserid,firstname,lastname,internalemailaddress,title";
  const titleFilters = [
    "Account Executive",
    "Director of Major Accounts",
    "Director of Sales",
    "Technology Advisor",
    "VP, Sales",
    "VP of Sales",
  ].map((t) => `contains(title,'${t}')`).join(" or ");
  const filter = `contains(internalemailaddress,'@packetfusion.com') and isdisabled eq false and (${titleFilters})`;
  const path = `/systemusers?$select=${select}&$filter=${filter}&$top=50&$orderby=lastname asc`;

  const data = await dynamicsGet<{ value: DynamicsUser[] }>(env, path);
  return data.value ?? [];
}

export async function getPacketFusionSAs(env: Env): Promise<DynamicsUser[]> {
  if (!isConfigured(env)) return [];

  const select = "systemuserid,firstname,lastname,internalemailaddress,title";
  const titleFilters = [
    "Solutions Architect",
    "Cloud Architect",
  ].map((t) => `contains(title,'${t}')`).join(" or ");
  const filter = `contains(internalemailaddress,'@packetfusion.com') and isdisabled eq false and (${titleFilters})`;
  const path = `/systemusers?$select=${select}&$filter=${filter}&$top=50&$orderby=lastname asc`;

  const data = await dynamicsGet<{ value: DynamicsUser[] }>(env, path);
  return data.value ?? [];
}

export async function getPacketFusionCSMs(env: Env): Promise<DynamicsUser[]> {
  if (!isConfigured(env)) return [];

  const select = "systemuserid,firstname,lastname,internalemailaddress,title";
  const titleFilters = [
    "Client Success Manager",
    "Customer Success Manager",
    "Customer Advocate",
  ].map((t) => `contains(title,'${t}')`).join(" or ");
  const filter = `contains(internalemailaddress,'@packetfusion.com') and isdisabled eq false and (${titleFilters})`;
  const path = `/systemusers?$select=${select}&$filter=${filter}&$top=50&$orderby=lastname asc`;

  const data = await dynamicsGet<{ value: DynamicsUser[] }>(env, path);
  return data.value ?? [];
}

export type DynamicsOpportunity = {
  opportunityid: string;
  name: string;
  estimatedclosedate: string | null;
  statecode: number;
};

export async function getAccountOpportunities(env: Env, accountId: string): Promise<DynamicsOpportunity[]> {
  if (!isConfigured(env)) return [];

  const select = "opportunityid,name,estimatedclosedate,statecode";
  const filter = `_parentaccountid_value eq ${accountId} and statecode eq 0`;
  const path = `/opportunities?$select=${select}&$filter=${filter}&$top=50&$orderby=name asc`;

  const data = await dynamicsGet<{ value: DynamicsOpportunity[] }>(env, path);
  return data.value ?? [];
}

export async function getPacketFusionEngineers(env: Env): Promise<DynamicsUser[]> {
  if (!isConfigured(env)) return [];

  const select = "systemuserid,firstname,lastname,internalemailaddress,title";
  const titleFilters = [
    "Engineer",
    "Technician",
  ].map((t) => `contains(title,'${t}')`).join(" or ");
  const filter = `contains(internalemailaddress,'@packetfusion.com') and isdisabled eq false and (${titleFilters})`;
  const path = `/systemusers?$select=${select}&$filter=${filter}&$top=50&$orderby=lastname asc`;

  const data = await dynamicsGet<{ value: DynamicsUser[] }>(env, path);
  return data.value ?? [];
}
