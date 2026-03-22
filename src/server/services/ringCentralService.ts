const RC_API_BASE = "https://platform.ringcentral.com/restapi/v1.0";
const RC_ANALYTICS_BASE = "https://platform.ringcentral.com";
const RC_TOKEN_URL = "https://platform.ringcentral.com/restapi/oauth/token";

export type RCCreds = {
  client_id: string;
  client_secret: string;
  jwt_token: string;
};

type TokenCache = {
  access_token: string;
  expires_at: number;
};

export type RCAnalytics = {
  total_calls: number;
  answered: number;
  missed: number;
  inbound: number;
  outbound: number;
  total_duration_sec: number;
  abandoned: number;
  business_hours: number;
  after_hours: number;
};

export type RCStatus = {
  account: {
    name: string;
    main_number: string | null;
    brand: string | null;
    service_plan: string | null;
    billing_plan: string | null;
    included_lines: number | null;
    account_since: string | null;
    status: string | null;
  } | null;
  total_extensions: number | null;
  extension_breakdown: Record<string, number> | null;
  call_queues: number | null;
  ivr_menus: number | null;
  devices: number | null;
  analytics_30d: RCAnalytics | null;
  warnings: string[];
};

function credsKey(projectId: string) { return `rc:creds:${projectId}`; }
function tokenKey(projectId: string) { return `rc:token:${projectId}`; }

export async function saveCreds(kv: KVNamespace, projectId: string, creds: RCCreds): Promise<void> {
  await kv.put(credsKey(projectId), JSON.stringify(creds));
}

export async function deleteCreds(kv: KVNamespace, projectId: string): Promise<void> {
  await Promise.all([kv.delete(credsKey(projectId)), kv.delete(tokenKey(projectId))]);
}

export async function getCredsConfigured(kv: KVNamespace, projectId: string): Promise<boolean> {
  return (await kv.get(credsKey(projectId))) !== null;
}

async function getCreds(kv: KVNamespace, projectId: string): Promise<RCCreds | null> {
  return kv.get<RCCreds>(credsKey(projectId), "json");
}

async function getToken(kv: KVNamespace, creds: RCCreds, projectId: string): Promise<string> {
  const cached = await kv.get<TokenCache>(tokenKey(projectId), "json");
  if (cached && cached.expires_at > Date.now() + 60_000) return cached.access_token;

  const res = await fetch(RC_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${creds.client_id}:${creds.client_secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${encodeURIComponent(creds.jwt_token)}`,
  });

  if (!res.ok) throw new Error(`RingCentral token fetch failed: ${res.status} ${await res.text()}`);

  const data = await res.json() as { access_token: string; expires_in: number };
  await kv.put(
    tokenKey(projectId),
    JSON.stringify({ access_token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 }),
    { expirationTtl: data.expires_in - 60 }
  );
  return data.access_token;
}

async function rcGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${RC_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`RC API ${res.status} ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function rcPost<T>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${RC_ANALYTICS_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RC Analytics API ${res.status} ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

type AnalyticsResponse = {
  data?: {
    records?: Array<{
      counters?: {
        allCalls?: { values?: number };
        callsByDirection?: { values?: { inbound?: number; outbound?: number } };
        callsByResponse?: { values?: { answered?: number; notAnswered?: number; connected?: number; notConnected?: number } };
        callsByResult?: { values?: { abandoned?: number; voicemail?: number; missed?: number } };
        callsByCompanyHours?: { values?: { businessHours?: number; afterHours?: number } };
      };
      timers?: {
        allCalls?: { values?: number };
      };
    }>;
  };
};

function parseAnalytics(raw: AnalyticsResponse): RCAnalytics {
  const row = raw.data?.records?.[0];
  const c = row?.counters;
  const t = row?.timers;
  return {
    total_calls: c?.allCalls?.values ?? 0,
    answered: c?.callsByResponse?.values?.answered ?? 0,
    missed: c?.callsByResponse?.values?.notAnswered ?? 0,
    inbound: c?.callsByDirection?.values?.inbound ?? 0,
    outbound: c?.callsByDirection?.values?.outbound ?? 0,
    total_duration_sec: t?.allCalls?.values ?? 0,
    abandoned: c?.callsByResult?.values?.abandoned ?? 0,
    business_hours: c?.callsByCompanyHours?.values?.businessHours ?? 0,
    after_hours: c?.callsByCompanyHours?.values?.afterHours ?? 0,
  };
}

function settled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

type ExtensionRecord = { type: string };
type ExtensionPage = { records: ExtensionRecord[]; paging: { totalPages: number; totalElements: number } };

async function getExtensionBreakdown(token: string): Promise<{ total: number; byType: Record<string, number> }> {
  const first = await rcGet<ExtensionPage>(token, "/account/~/extension?perPage=1000");
  const allRecords = [...first.records];

  if (first.paging.totalPages > 1) {
    const remaining = Array.from({ length: first.paging.totalPages - 1 }, (_, i) =>
      rcGet<ExtensionPage>(token, `/account/~/extension?perPage=1000&page=${i + 2}`)
    );
    const rest = await Promise.all(remaining);
    for (const r of rest) allRecords.push(...r.records);
  }

  const byType: Record<string, number> = {};
  for (const ext of allRecords) {
    byType[ext.type] = (byType[ext.type] ?? 0) + 1;
  }
  return { total: first.paging.totalElements, byType };
}

export async function getRCStatus(kv: KVNamespace, projectId: string): Promise<RCStatus | null> {
  const creds = await getCreds(kv, projectId);
  if (!creds) return null;

  const token = await getToken(kv, creds, projectId);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const analyticsBody = {
    grouping: { groupBy: "Company" },
    timeSettings: {
      timeZone: "UTC",
      timeRange: {
        timeFrom: thirtyDaysAgo.toISOString(),
        timeTo: now.toISOString(),
      },
    },
    responseOptions: {
      counters: {
        allCalls: { aggregationType: "Sum" },
        callsByResponse: { aggregationType: "Sum" },
        callsByDirection: { aggregationType: "Sum" },
        callsByResult: { aggregationType: "Sum" },
        callsByCompanyHours: { aggregationType: "Sum" },
      },
      timers: {
        allCalls: { aggregationType: "Sum" },
      },
    },
  };

  // Fetch account first — we need the numeric account ID for the analytics endpoint
  // (the analytics API does not reliably support the ~ wildcard)
  const accountData = await rcGet<{
    id: number;
    name: string;
    mainNumber: string;
    status: string;
    serviceInfo: {
      brand: { name: string };
      servicePlan: { name: string };
      billingPlan: { name: string; includedPhoneLines: number };
    };
    signupInfo: { creationTime: string };
  }>(token, "/account/~");

  const accountId = String(accountData.id);

  const [extensionBreakdownRes, ivrRes, devicesRes, analyticsRes] = await Promise.allSettled([
    getExtensionBreakdown(token),
    rcGet<{ paging?: { totalElements: number }; navigation?: { totalRecords: number } }>(token, "/account/~/ivr-menus?perPage=1"),
    rcGet<{ paging: { totalElements: number } }>(token, "/account/~/device?perPage=1"),
    rcPost<AnalyticsResponse>(token, `/analytics/calls/v1/accounts/${accountId}/aggregation/fetch`, analyticsBody),
  ]);

  const warnings: string[] = [];
  if (extensionBreakdownRes.status === "rejected") {
    warnings.push(`Extension data unavailable: ${extensionBreakdownRes.reason}`);
  }
  if (analyticsRes.status === "rejected") {
    warnings.push(`Call analytics unavailable: ${analyticsRes.reason}`);
  }

  const ivrData = settled(ivrRes);
  const ivrTotal = ivrData?.paging?.totalElements ?? ivrData?.navigation?.totalRecords ?? null;
  const analyticsData = settled(analyticsRes);
  const extData = settled(extensionBreakdownRes);

  return {
    account: {
      name: accountData.name,
      main_number: accountData.mainNumber ?? null,
      brand: accountData.serviceInfo?.brand?.name ?? null,
      service_plan: accountData.serviceInfo?.servicePlan?.name ?? null,
      billing_plan: accountData.serviceInfo?.billingPlan?.name ?? null,
      included_lines: accountData.serviceInfo?.billingPlan?.includedPhoneLines ?? null,
      account_since: accountData.signupInfo?.creationTime ?? null,
      status: accountData.status ?? null,
    },
    total_extensions: extData?.total ?? null,
    extension_breakdown: extData?.byType ?? null,
    call_queues: extData?.byType?.Department ?? null,
    ivr_menus: ivrTotal,
    devices: settled(devicesRes)?.paging?.totalElements ?? null,
    analytics_30d: analyticsData ? parseAnalytics(analyticsData) : null,
    warnings,
  };
}
