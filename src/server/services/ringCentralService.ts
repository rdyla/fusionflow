const RC_API_BASE = "https://platform.ringcentral.com/restapi/v1.0";
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

export type RCStatus = {
  account: { name: string; main_number: string | null; brand: string | null } | null;
  total_extensions: number | null;
  call_queues: number | null;
  ivr_menus: number | null;
  devices: number | null;
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

function settled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

export async function getRCStatus(kv: KVNamespace, projectId: string): Promise<RCStatus | null> {
  const creds = await getCreds(kv, projectId);
  if (!creds) return null;

  const token = await getToken(kv, creds, projectId);

  const [accountRes, extensionsRes, queuesRes, ivrRes, devicesRes] = await Promise.allSettled([
    rcGet<{ name: string; mainNumber: string; serviceInfo: { brand: { name: string } } }>(token, "/account/~"),
    rcGet<{ paging: { totalElements: number } }>(token, "/account/~/extension?perPage=1"),
    rcGet<{ paging: { totalElements: number } }>(token, "/account/~/extension?type=Department&perPage=1"),
    rcGet<{ paging?: { totalElements: number }; navigation?: { totalRecords: number } }>(token, "/account/~/ivr-menus?perPage=1"),
    rcGet<{ paging: { totalElements: number } }>(token, "/account/~/device?perPage=1"),
  ]);

  if (accountRes.status === "rejected") {
    throw new Error(`RingCentral account lookup failed: ${accountRes.reason}`);
  }

  const warnings: string[] = [];

  const accountData = accountRes.value;
  const ivrData = settled(ivrRes);
  const ivrTotal = ivrData?.paging?.totalElements ?? ivrData?.navigation?.totalRecords ?? null;

  return {
    account: {
      name: accountData.name,
      main_number: accountData.mainNumber ?? null,
      brand: accountData.serviceInfo?.brand?.name ?? null,
    },
    total_extensions: settled(extensionsRes)?.paging?.totalElements ?? null,
    call_queues: settled(queuesRes)?.paging?.totalElements ?? null,
    ivr_menus: ivrTotal,
    devices: settled(devicesRes)?.paging?.totalElements ?? null,
    warnings,
  };
}
