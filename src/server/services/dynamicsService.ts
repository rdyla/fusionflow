const ORG_URL = "https://packetfusioncrm.crm.dynamics.com";
const API_BASE = `${ORG_URL}/api/data/v9.2`;
const TOKEN_CACHE_KEY = "dynamics_token";
const SUPPORT_TOKEN_CACHE_KEY = "dynamics_token_support";

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
  DYNAMICS_SUPPORT_CLIENT_ID?: string;
  DYNAMICS_SUPPORT_CLIENT_SECRET?: string;
};

function isConfigured(env: Env): boolean {
  return !!(env.DYNAMICS_TENANT_ID && env.DYNAMICS_CLIENT_ID && env.DYNAMICS_CLIENT_SECRET);
}

async function getTokenFor(
  env: Env,
  clientId: string,
  clientSecret: string,
  cacheKey: string,
): Promise<string> {
  const cached = await env.KV.get<TokenCache>(cacheKey, "json");
  if (cached && cached.expires_at > Date.now() + 60_000) {
    return cached.access_token;
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
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

  await env.KV.put(cacheKey, JSON.stringify(cache), { expirationTtl: data.expires_in - 60 });

  return data.access_token;
}

async function getToken(env: Env): Promise<string> {
  return getTokenFor(env, env.DYNAMICS_CLIENT_ID!, env.DYNAMICS_CLIENT_SECRET!, TOKEN_CACHE_KEY);
}

// Support portal uses a dedicated app registration so cases are owned by the
// "pfsupport portal" user in D365 (preserving existing dashboards/alerts).
// Falls back to the main app creds if support-specific secrets are not set.
async function getSupportToken(env: Env): Promise<string> {
  const clientId = env.DYNAMICS_SUPPORT_CLIENT_ID;
  const clientSecret = env.DYNAMICS_SUPPORT_CLIENT_SECRET;
  if (clientId && clientSecret) {
    return getTokenFor(env, clientId, clientSecret, SUPPORT_TOKEN_CACHE_KEY);
  }
  return getToken(env);
}

/** Low-level authenticated fetch against the D365 Web API. */
export async function d365Fetch(env: Env, path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken(env);
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> ?? {}),
    },
  });
}

/** Same as d365Fetch, but authenticates as the support-portal app user so
 *  cases, notes, and attachments are owned by "pfsupport portal" in D365. */
export async function d365FetchSupport(env: Env, path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getSupportToken(env);
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> ?? {}),
    },
  });
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

/** Create a record; returns the new entity GUID extracted from the OData-EntityId response header. */
async function dynamicsCreate(env: Env, path: string, body: Record<string, unknown>): Promise<string> {
  const token = await getToken(env);
  const jsonBody = JSON.stringify(body);
  console.log(`[dynamicsCreate] POST ${path} body:`, jsonBody);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
    },
    body: jsonBody,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Dynamics create error ${res.status} ${path}: ${text}`);
  }

  const entityId = res.headers.get("OData-EntityId") ?? "";
  const match = entityId.match(/\(([^)]+)\)$/);
  if (!match) throw new Error(`Dynamics create: missing entity ID header for ${path}`);
  return match[1];
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

export type DynamicsQuote = {
  quoteid: string;
  name: string;
  statecode: number;
  stateLabel: string;
  am_sow: number | null;
  opportunityId: string | null;
};

export type AccountTeam = {
  ae_name: string | null;
  ae_email: string | null;
  sa_name: string | null;
  sa_email: string | null;
  csm_name: string | null;
  csm_email: string | null;
  address_city: string | null;
  address_state: string | null;
};

export async function getAccountTeam(env: Env, accountId: string): Promise<AccountTeam> {
  if (!isConfigured(env)) return { ae_name: null, ae_email: null, sa_name: null, sa_email: null, csm_name: null, csm_email: null, address_city: null, address_state: null };

  // Step 1: fetch the account with annotated formatted values for the three lookup fields.
  // Using $select with the _value convention plus annotation header gives us names without $expand.
  const select = "_ownerid_value,_pfi_solutionarchitect_value,_territoryid_value,address1_city,address1_stateorprovince";
  const path = `/accounts(${accountId})?$select=${select}`;

  type RawAccount = { [key: string]: unknown };

  let ae_name: string | null = null;
  let ae_email: string | null = null;
  let sa_name: string | null = null;
  let sa_email: string | null = null;
  let csm_name: string | null = null;
  let csm_email: string | null = null;
  let address_city: string | null = null;
  let address_state: string | null = null;

  try {
    const data = await dynamicsGetAnnotated<RawAccount>(env, path);

    const aeId = data["_ownerid_value"] as string | null;
    ae_name = (data["_ownerid_value@OData.Community.Display.V1.FormattedValue"] as string | null) ?? null;

    const saId = data["_pfi_solutionarchitect_value"] as string | null;
    sa_name = (data["_pfi_solutionarchitect_value@OData.Community.Display.V1.FormattedValue"] as string | null) ?? null;

    const territoryId = data["_territoryid_value"] as string | null;
    address_city = (data["address1_city"] as string | null) ?? null;
    address_state = (data["address1_stateorprovince"] as string | null) ?? null;

    // Step 2: fetch emails for AE and SA, and resolve CSM via territory manager
    const userFetch = async (id: string) => {
      const u = await dynamicsGet<{ internalemailaddress: string | null }>(
        env, `/systemusers(${id})?$select=internalemailaddress`
      );
      return u.internalemailaddress ?? null;
    };

    if (aeId) {
      try { ae_email = await userFetch(aeId); } catch { /* non-fatal */ }
    }

    if (saId && saId !== aeId) {
      try { sa_email = await userFetch(saId); } catch { /* non-fatal */ }
    } else if (saId && saId === aeId) {
      sa_email = ae_email;
    }

    // Step 3: fetch territory manager for CSM name + email
    if (territoryId) {
      try {
        const territory = await dynamicsGetAnnotated<{ [key: string]: unknown }>(
          env, `/territories(${territoryId})?$select=_managerid_value`
        );
        const managerId = territory["_managerid_value"] as string | null;
        csm_name = (territory["_managerid_value@OData.Community.Display.V1.FormattedValue"] as string | null) ?? null;
        if (managerId) {
          try { csm_email = await userFetch(managerId); } catch { /* non-fatal */ }
        }
      } catch { /* non-fatal */ }
    }
  } catch {
    // Return whatever we managed to collect
  }

  return { ae_name, ae_email, sa_name, sa_email, csm_name, csm_email, address_city, address_state };
}

export async function getAccountOpportunities(env: Env, accountId: string): Promise<DynamicsOpportunity[]> {
  if (!isConfigured(env)) return [];

  const select = "opportunityid,name,estimatedclosedate,statecode";
  const filter = `_parentaccountid_value eq ${accountId}`;
  const path = `/opportunities?$select=${select}&$filter=${filter}&$top=50&$orderby=name asc`;

  const data = await dynamicsGet<{ value: DynamicsOpportunity[] }>(env, path);
  return data.value ?? [];
}

const QUOTE_STATE: Record<number, string> = { 0: "Draft", 1: "Active", 2: "Won", 4: "Closed" };

export async function getOpportunityQuotes(env: Env, opportunityId: string): Promise<DynamicsQuote[]> {
  if (!isConfigured(env)) return [];
  const select = "quoteid,name,statecode,am_sow,_opportunityid_value";
  const filter = `_opportunityid_value eq ${opportunityId}`;
  const path = `/quotes?$select=${select}&$filter=${filter}&$top=20&$orderby=createdon desc`;
  try {
    const data = await dynamicsGet<{ value: Array<{
      quoteid: string; name: string; statecode: number; am_sow: number | null; _opportunityid_value: string | null;
    }> }>(env, path);
    return (data.value ?? []).map((q) => ({
      quoteid: q.quoteid,
      name: q.name,
      statecode: q.statecode,
      stateLabel: QUOTE_STATE[q.statecode] ?? String(q.statecode),
      am_sow: q.am_sow,
      opportunityId: q._opportunityid_value,
    }));
  } catch {
    return [];
  }
}

export async function getCaseByTicketNumber(env: Env, ticketNumber: string): Promise<SupportCase | null> {
  if (!isConfigured(env)) return null;
  const escaped = ticketNumber.replace(/'/g, "''");
  const select = "incidentid,title,description,ticketnumber,statecode,statuscode,prioritycode,casetypecode,createdon,modifiedon,_customerid_value,_ownerid_value";
  const path = `/incidents?$select=${select}&$filter=ticketnumber eq '${escaped}'&$top=1`;
  try {
    const data = await dynamicsGetAnnotated<{ value: RawCase[] }>(env, path);
    const raw = data.value?.[0];
    return raw ? mapCase(raw) : null;
  } catch {
    return null;
  }
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

// ── Support / Cases ──────────────────────────────────────────────────────────

export type SupportCase = {
  id: string;
  ticketNumber: string | null;
  title: string;
  description: string | null;
  statecode: number;   // 0=Active, 1=Resolved, 2=Cancelled
  statuscode: number;
  status: string;      // human-readable status
  prioritycode: number; // 1=High, 2=Normal, 3=Low
  priority: string;
  casetypecode: number | null; // 1=Question, 2=Problem, 3=Request
  caseType: string | null;
  accountId: string | null;
  accountName: string | null;
  ownerName: string | null;
  createdOn: string;
  modifiedOn: string;
};

export type CaseNote = {
  id: string;
  subject: string | null;
  text: string | null;
  isAttachment: boolean;
  filename: string | null;
  mimetype: string | null;
  createdOn: string;
  createdBy: string | null;
};

type RawCase = {
  incidentid: string;
  title: string;
  description: string | null;
  ticketnumber: string | null;
  statecode: number;
  statuscode: number;
  prioritycode: number;
  casetypecode: number | null;
  createdon: string;
  modifiedon: string;
  _customerid_value: string | null;
  _ownerid_value: string | null;
  [key: string]: unknown;
};

type RawAnnotation = {
  annotationid: string;
  subject: string | null;
  notetext: string | null;
  filename: string | null;
  mimetype: string | null;
  isdocument: boolean;
  createdon: string;
  _createdby_value: string | null;
  [key: string]: unknown;
};

const STATUS_LABELS: Record<number, string> = {
  1: "In Progress", 2: "On Hold", 3: "Waiting for Details", 4: "Researching",
  5: "Problem Solved", 1000: "Information Provided", 2000: "Cancelled", 2001: "Merged",
};
const STATE_LABELS: Record<number, string> = { 0: "Active", 1: "Resolved", 2: "Cancelled" };
const PRIORITY_LABELS: Record<number, string> = { 1: "High", 2: "Normal", 3: "Low" };
const CASETYPE_LABELS: Record<number, string> = { 1: "Question", 2: "Problem", 3: "Request" };

function mapCase(raw: RawCase): SupportCase {
  return {
    id: raw.incidentid,
    ticketNumber: raw.ticketnumber,
    title: raw.title,
    description: raw.description,
    statecode: raw.statecode,
    statuscode: raw.statuscode,
    status: STATUS_LABELS[raw.statuscode] ?? STATE_LABELS[raw.statecode] ?? "Unknown",
    prioritycode: raw.prioritycode,
    priority: PRIORITY_LABELS[raw.prioritycode] ?? "Normal",
    casetypecode: raw.casetypecode,
    caseType: raw.casetypecode != null ? (CASETYPE_LABELS[raw.casetypecode] ?? null) : null,
    accountId: raw._customerid_value,
    accountName: (raw["_customerid_value@OData.Community.Display.V1.FormattedValue"] as string | null) ?? null,
    ownerName: (raw["_ownerid_value@OData.Community.Display.V1.FormattedValue"] as string | null) ?? null,
    createdOn: raw.createdon,
    modifiedOn: raw.modifiedon,
  };
}

function mapAnnotation(raw: RawAnnotation): CaseNote {
  return {
    id: raw.annotationid,
    subject: raw.subject,
    text: raw.notetext,
    isAttachment: raw.isdocument,
    filename: raw.filename,
    mimetype: raw.mimetype,
    createdOn: raw.createdon,
    createdBy: (raw["_createdby_value@OData.Community.Display.V1.FormattedValue"] as string | null) ?? null,
  };
}

async function dynamicsGetAnnotated<T>(env: Env, path: string): Promise<T> {
  const token = await getToken(env);
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      "Prefer": `odata.include-annotations="OData.Community.Display.V1.FormattedValue"`,
    },
  });
  if (!res.ok) throw new Error(`Dynamics API error: ${res.status} ${path}`);
  return res.json() as Promise<T>;
}

async function dynamicsPost<T>(env: Env, path: string, body: unknown, options?: { prefer?: string }): Promise<T> {
  const token = await getToken(env);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
  };
  if (options?.prefer) headers["Prefer"] = options.prefer;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Dynamics POST error: ${res.status} ${path} - ${text}`);
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

async function dynamicsPatch(env: Env, path: string, body: unknown): Promise<void> {
  const token = await getToken(env);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Dynamics PATCH error: ${res.status} ${path} - ${text}`);
  }
}

export async function getCases(env: Env, accountId?: string): Promise<SupportCase[]> {
  if (!isConfigured(env)) return [];
  const select = "incidentid,title,description,ticketnumber,statecode,statuscode,prioritycode,casetypecode,createdon,modifiedon,_customerid_value,_ownerid_value";
  const filter = accountId ? `&$filter=_customerid_value eq ${accountId}` : "";
  const path = `/incidents?$select=${select}${filter}&$top=100&$orderby=modifiedon desc`;
  const data = await dynamicsGetAnnotated<{ value: RawCase[] }>(env, path);
  return (data.value ?? []).map(mapCase);
}

export async function getCase(env: Env, caseId: string): Promise<SupportCase | null> {
  if (!isConfigured(env)) return null;
  const select = "incidentid,title,description,ticketnumber,statecode,statuscode,prioritycode,casetypecode,createdon,modifiedon,_customerid_value,_ownerid_value";
  try {
    const raw = await dynamicsGetAnnotated<RawCase>(env, `/incidents(${caseId})?$select=${select}`);
    return mapCase(raw);
  } catch {
    return null;
  }
}

export async function createCase(env: Env, payload: {
  title: string;
  description?: string;
  prioritycode?: number;
  casetypecode?: number;
  accountId?: string;
}): Promise<SupportCase> {
  const body: Record<string, unknown> = {
    title: payload.title,
    description: payload.description ?? "",
    prioritycode: payload.prioritycode ?? 2,
    casetypecode: payload.casetypecode ?? 2,
  };
  if (payload.accountId) {
    body["customerid_account@odata.bind"] = `/accounts(${payload.accountId})`;
  }
  const raw = await dynamicsPost<RawCase>(env, "/incidents", body, { prefer: "return=representation" });
  return mapCase(raw);
}

export async function updateCase(env: Env, caseId: string, payload: {
  title?: string;
  description?: string;
  statecode?: number;
  statuscode?: number;
  prioritycode?: number;
}): Promise<void> {
  // Note: transitioning to statecode=1 (Resolved) may require the CloseIncident action
  // in some D365 configurations. If PATCH fails for Resolved status, use the
  // POST /CloseIncident action instead.
  await dynamicsPatch(env, `/incidents(${caseId})`, payload);
}

export async function getCaseNotes(env: Env, caseId: string): Promise<CaseNote[]> {
  if (!isConfigured(env)) return [];
  const select = "annotationid,subject,notetext,filename,mimetype,isdocument,createdon,_createdby_value";
  const filter = `_objectid_value eq ${caseId}`;
  const path = `/annotations?$select=${select}&$filter=${filter}&$orderby=createdon asc`;
  const data = await dynamicsGetAnnotated<{ value: RawAnnotation[] }>(env, path);
  return (data.value ?? []).map(mapAnnotation);
}

export async function addCaseNote(env: Env, caseId: string, payload: {
  subject: string;
  notetext: string;
}): Promise<CaseNote> {
  const body = {
    subject: payload.subject,
    notetext: payload.notetext,
    "objectid_incident@odata.bind": `/incidents(${caseId})`,
  };
  const raw = await dynamicsPost<RawAnnotation>(env, "/annotations", body, { prefer: "return=representation" });
  return mapAnnotation(raw);
}

export async function addCaseAttachment(env: Env, caseId: string, payload: {
  filename: string;
  mimetype: string;
  documentbody: string; // base64
  subject: string;
  notetext?: string;
}): Promise<CaseNote> {
  const body = {
    subject: payload.subject,
    notetext: payload.notetext ?? "",
    filename: payload.filename,
    documentbody: payload.documentbody,
    mimetype: payload.mimetype,
    isdocument: true,
    "objectid_incident@odata.bind": `/incidents(${caseId})`,
  };
  const raw = await dynamicsPost<RawAnnotation>(env, "/annotations", body, { prefer: "return=representation" });
  return mapAnnotation(raw);
}

// ── Case Time Entries ─────────────────────────────────────────────────────────

export type CaseTimeEntry = {
  id: string;
  description: string | null;
  date: string | null;
  durationMinutes: number | null;
  durationHours: number | null;
  resourceName: string | null;
  entryStatus: string | null;
  createdOn: string;
};

type RawAmcTimeEntry = {
  activityid: string;
  subject: string | null;
  amc_durationhours: number | null;
  scheduledstart: string | null;
  amc_notes: string | null;
  statuscode: number | null;
  amc_dayofweek: string | null;
  createdon: string;
  [key: string]: unknown;
};

const AMC_STATUS: Record<number, string> = {
  1: "Open", 2: "Completed", 3: "Cancelled",
};

export async function getCaseTimeEntries(env: Env, caseId: string): Promise<CaseTimeEntry[]> {
  if (!isConfigured(env)) return [];
  const select = [
    "activityid",
    "subject",
    "amc_durationhours",
    "scheduledstart",
    "amc_notes",
    "statuscode",
    "amc_dayofweek",
    "createdon",
    "_amc_member_value",
    "_amc_costcode_value",
  ].join(",");
  const path = `/amc_timeentries?$select=${select}&$filter=_amc_case_value eq ${caseId}&$orderby=scheduledstart desc&$top=500`;
  try {
    const data = await dynamicsGetAnnotated<{ value: RawAmcTimeEntry[] }>(env, path);
    return (data.value ?? []).map((raw): CaseTimeEntry => {
      const hours = raw.amc_durationhours ?? null;
      const costCode = (raw["_amc_costcode_value@OData.Community.Display.V1.FormattedValue"] as string | null) ?? null;
      const member = (raw["_amc_member_value@OData.Community.Display.V1.FormattedValue"] as string | null) ?? null;
      const notes = raw.amc_notes ?? raw.subject ?? null;
      return {
        id: raw.activityid,
        description: notes ? `${notes}${costCode ? ` · ${costCode}` : ""}` : (costCode ?? null),
        date: raw.scheduledstart ? raw.scheduledstart.split("T")[0] : raw.createdon.split("T")[0],
        durationMinutes: hours != null ? Math.round(hours * 60) : null,
        durationHours: hours,
        resourceName: member,
        entryStatus: raw.statuscode != null ? (AMC_STATUS[raw.statuscode] ?? String(raw.statuscode)) : null,
        createdOn: raw.createdon,
      };
    });
  } catch (e) {
    console.error("getCaseTimeEntries error:", e);
    return [];
  }
}

// Fetch a single amc_timeentry record by its GUID to inspect available fields.
// Call GET /api/dynamics/time-entries/:id/inspect
export async function inspectTimeEntry(env: Env, entryId: string): Promise<unknown> {
  if (!isConfigured(env)) return { error: "not configured" };
  try {
    return await dynamicsGetAnnotated<unknown>(env, `/amc_timeentries(${entryId})`);
  } catch (e) {
    return { error: String(e) };
  }
}

// Diagnostic: probe multiple possible time-tracking entities for a case.
// Call GET /api/dynamics/cases/:id/diagnose to see what's actually in the org.
export async function diagnoseCaseTimeEntries(env: Env, caseId: string): Promise<Record<string, unknown>> {
  if (!isConfigured(env)) return { error: "Dynamics not configured" };

  async function probe(path: string) {
    try {
      const data = await dynamicsGetAnnotated<{ value: unknown[] }>(env, path);
      return { count: (data.value ?? []).length, sample: (data.value ?? []).slice(0, 3), error: null };
    } catch (e) {
      return { count: 0, sample: [], error: String(e) };
    }
  }

  // Discover all entity definitions whose logical name contains "time"
  async function discoverTimeEntities() {
    try {
      const data = await dynamicsGet<{ value: Array<{ LogicalName: string; EntitySetName: string }> }>(
        env,
        `/EntityDefinitions?$select=LogicalName,EntitySetName&$filter=contains(LogicalName,'time')&$top=50`
      );
      return (data.value ?? []).map((e) => ({ logicalName: e.LogicalName, entitySetName: e.EntitySetName }));
    } catch (e) {
      return { error: String(e) };
    }
  }

  const [
    timeEntityDefs,
    activityPointers,
    phoneCalls,
    tasks,
    annotations,
  ] = await Promise.all([
    discoverTimeEntities(),
    probe(`/activitypointers?$select=activityid,subject,actualdurationminutes,actualstart,activitytypecode,createdon,_createdby_value&$filter=_regardingobjectid_value eq ${caseId}&$top=10`),
    probe(`/phonecalls?$select=activityid,subject,actualdurationminutes,actualstart,createdon,_createdby_value&$filter=_regardingobjectid_value eq ${caseId}&$top=10`),
    probe(`/tasks?$select=activityid,subject,actualdurationminutes,actualstart,createdon,_createdby_value&$filter=_regardingobjectid_value eq ${caseId}&$top=10`),
    probe(`/annotations?$select=annotationid,subject,notetext,createdon,_createdby_value&$filter=_objectid_value eq ${caseId}&$top=5`),
  ]);

  return {
    caseId,
    "entity_definitions_with_time_in_name": timeEntityDefs,
    "activitypointers": activityPointers,
    "phonecalls": phoneCalls,
    "tasks": tasks,
    "annotations_count": annotations,
  };
}

// ── Portal Contact Auth ───────────────────────────────────────────────────────

export type PortalContact = {
  contactid: string;
  email: string;
  name: string;
  accountId: string | null;
  accountName: string | null;
  canOpenCases: boolean;
};

type RawPortalContact = {
  contactid: string;
  firstname: string | null;
  lastname: string | null;
  emailaddress1: string | null;
  vtx_portaluser: boolean | null;
  amc_allowcaseopening: boolean | null;
  _parentcustomerid_value: string | null;
  [key: string]: unknown;
};

type PortalContactCache = { found: true; contact: PortalContact } | { found: false };

export async function getPortalContact(env: Env, email: string): Promise<PortalContact | null> {
  if (!isConfigured(env)) return null;

  const cacheKey = `portal_contact:${email.toLowerCase()}`;

  // Check KV cache first — avoids hitting CRM on every request
  const cached = await env.KV.get<PortalContactCache>(cacheKey, "json");
  if (cached !== null) {
    return cached.found ? cached.contact : null;
  }

  const escaped = email.toLowerCase().replace(/'/g, "''");
  const select = "contactid,firstname,lastname,emailaddress1,vtx_portaluser,amc_allowcaseopening,_parentcustomerid_value";
  const filter = `emailaddress1 eq '${escaped}' and vtx_portaluser eq true`;
  const path = `/contacts?$select=${select}&$filter=${filter}&$top=1`;

  try {
    const data = await dynamicsGetAnnotated<{ value: RawPortalContact[] }>(env, path);
    const raw = data.value?.[0];

    if (!raw) {
      // Cache negative result briefly to avoid hammering CRM for unknown emails
      await env.KV.put(cacheKey, JSON.stringify({ found: false }), { expirationTtl: 60 });
      return null;
    }

    const contact: PortalContact = {
      contactid: raw.contactid,
      email: raw.emailaddress1 ?? email,
      name: [raw.firstname, raw.lastname].filter(Boolean).join(" "),
      accountId: raw._parentcustomerid_value,
      accountName: (raw["_parentcustomerid_value@OData.Community.Display.V1.FormattedValue"] as string | null) ?? null,
      canOpenCases: raw.amc_allowcaseopening === true,
    };

    // Cache positive result for 5 minutes
    await env.KV.put(cacheKey, JSON.stringify({ found: true, contact }), { expirationTtl: 300 });
    return contact;
  } catch {
    // CRM unavailable — don't cache, allow retry on next request
    return null;
  }
}

export async function getAnnotationBody(env: Env, annotationId: string): Promise<{ documentbody: string; filename: string; mimetype: string } | null> {
  if (!isConfigured(env)) return null;
  try {
    return await dynamicsGet<{ documentbody: string; filename: string; mimetype: string }>(
      env,
      `/annotations(${annotationId})?$select=documentbody,filename,mimetype`
    );
  } catch {
    return null;
  }
}

// ── Time Entry ────────────────────────────────────────────────────────────────

export type DynamicsPayCode = {
  amc_paycodeid: string;
  amc_name: string;
  amc_description: string | null;
};

export type DynamicsCostCode = {
  amc_costcodeid: string;
  amc_name: string;
  amc_description: string | null;
};

/** Fetch all pay codes (cached 1 hour). */
export async function getPayCodes(env: Env): Promise<DynamicsPayCode[]> {
  if (!isConfigured(env)) return [];
  const cacheKey = "dynamics:paycodes";
  const cached = await env.KV.get<DynamicsPayCode[]>(cacheKey, "json");
  if (cached) return cached;
  try {
    const data = await dynamicsGet<{ value: DynamicsPayCode[] }>(
      env,
      "/amc_paycodes?$select=amc_paycodeid,amc_name,amc_description&$orderby=amc_name asc"
    );
    const codes = data.value ?? [];
    await env.KV.put(cacheKey, JSON.stringify(codes), { expirationTtl: 3600 });
    return codes;
  } catch {
    return [];
  }
}

/** Get the job GUID and case GUID for a project's CRM case (by ticketnumber). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getCaseAndJob(
  env: Env,
  crmCaseId: string,
): Promise<{ caseId: string; jobId: string | null; accountId: string | null } | null> {
  if (!isConfigured(env)) return null;
  let row: { incidentid: string; _amc_job_value: string | null; _customerid_value: string | null } | undefined;
  if (UUID_RE.test(crmCaseId)) {
    const data = await dynamicsGet<{ incidentid: string; _amc_job_value: string | null; _customerid_value: string | null }>(
      env,
      `/incidents(${crmCaseId})?$select=incidentid,_amc_job_value,_customerid_value`
    );
    row = data;
  } else {
    const escaped = crmCaseId.replace(/'/g, "''");
    const data = await dynamicsGet<{ value: Array<{ incidentid: string; _amc_job_value: string | null; _customerid_value: string | null }> }>(
      env,
      `/incidents?$select=incidentid,_amc_job_value,_customerid_value&$filter=ticketnumber eq '${escaped}'&$top=1`
    );
    row = data.value?.[0];
  }
  if (!row) return null;
  return { caseId: row.incidentid, jobId: row._amc_job_value ?? null, accountId: row._customerid_value ?? null };
}

/** Fetch cost codes available for a job (cached 1 hour per job). */
export async function getCostCodesForJob(env: Env, jobId: string): Promise<DynamicsCostCode[]> {
  if (!isConfigured(env)) return [];
  const cacheKey = `dynamics:costcodes:${jobId}`;
  const cached = await env.KV.get<DynamicsCostCode[]>(cacheKey, "json");
  if (cached) return cached;
  try {
    const data = await dynamicsGet<{ value: DynamicsCostCode[] }>(
      env,
      `/amc_costcodes?$select=amc_costcodeid,amc_name,amc_description&$filter=_amc_job_value eq ${jobId}&$orderby=amc_name asc`
    );
    const codes = data.value ?? [];
    await env.KV.put(cacheKey, JSON.stringify(codes), { expirationTtl: 3600 });
    return codes;
  } catch {
    return [];
  }
}

/** Look up a Dynamics systemuser GUID by email address (cached 24 hours). */
export async function getSystemUserIdByEmail(env: Env, email: string): Promise<string | null> {
  if (!isConfigured(env)) return null;
  const cacheKey = `dynamics:sysuser:${email.toLowerCase()}`;
  const cached = await env.KV.get(cacheKey);
  if (cached !== null) return cached || null;
  try {
    const escaped = email.replace(/'/g, "''");
    const data = await dynamicsGet<{ value: Array<{ systemuserid: string }> }>(
      env,
      `/systemusers?$select=systemuserid&$filter=internalemailaddress eq '${escaped}' and isdisabled eq false&$top=1`
    );
    const userId = data.value?.[0]?.systemuserid ?? null;
    await env.KV.put(cacheKey, userId ?? "", { expirationTtl: 86400 });
    return userId;
  } catch {
    return null;
  }
}

export type CreateTimeEntryInput = {
  subject: string;
  scheduledStart: string;   // ISO datetime string (UTC)
  scheduledEnd: string;     // ISO datetime string (UTC)
  caseId: string;           // incident GUID
  jobId: string;            // amc_job GUID
  payCodeId: string;        // amc_paycode GUID
  costCodeId?: string | null;
  companyId?: string | null; // account GUID (amc_company)
  ownerId: string;          // systemuser GUID
};

/** Create an amc_timeentry record; returns the new entity GUID. */
/** Fetch lookup field + relationship navigation property names for amc_timeentry. */
export async function getTimeEntryLookupFields(env: Env): Promise<unknown> {
  const token = await getToken(env);
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
  };
  const [attrsRes, relsRes] = await Promise.all([
    fetch(`${API_BASE}/EntityDefinitions(LogicalName='amc_timeentry')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,SchemaName,Targets`, { headers }),
    fetch(`${API_BASE}/EntityDefinitions(LogicalName='amc_timeentry')/ManyToOneRelationships?$select=ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName`, { headers }),
  ]);
  const [attrs, rels] = await Promise.all([attrsRes.json(), relsRes.json()]);
  return { attributes: attrs, relationships: rels };
}

export async function createTimeEntry(env: Env, input: CreateTimeEntryInput): Promise<string> {
  const body: Record<string, unknown> = {
    subject: input.subject,
    scheduledstart: input.scheduledStart,
    scheduledend: input.scheduledEnd,
    // Navigation property names per ManyToOneRelationships metadata
    "amc_case_amc_timeentry@odata.bind": `/incidents(${input.caseId})`,
    "amc_job_amc_timeentry@odata.bind": `/amc_jobs(${input.jobId})`,
    "amc_paycode_amc_timeentry@odata.bind": `/amc_paycodes(${input.payCodeId})`,
    "amc_member_amc_timeentry@odata.bind": `/systemusers(${input.ownerId})`,
    "ownerid@odata.bind": `/systemusers(${input.ownerId})`,
  };
  if (input.costCodeId) {
    body["amc_costcode_amc_timeentry@odata.bind"] = `/amc_costcodes(${input.costCodeId})`;
  }
  if (input.companyId) {
    body["amc_company_amc_timeentry@odata.bind"] = `/accounts(${input.companyId})`;
  }
  return dynamicsCreate(env, "/amc_timeentries", body);
}
