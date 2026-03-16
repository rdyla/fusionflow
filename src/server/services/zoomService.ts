const ZOOM_API_BASE = "https://api.zoom.us/v2";
const ZOOM_OAUTH_URL = "https://zoom.us/oauth/token";

export type ZoomCreds = {
  account_id: string;
  client_id: string;
  client_secret: string;
};

type TokenCache = {
  access_token: string;
  expires_at: number;
};

export type ZoomDevice = {
  id: string;
  display_name: string;
  mac_address: string | null;
  model: string | null;
  status: string | null;
  assignee: { name: string; extension_number: string | null } | null;
};

export type ZoomStatus = {
  account: {
    id: string;
    account_name: string;
    account_type: number;
  };
  // Raw plans object — parsed dynamically on the frontend
  plans: Record<string, unknown>;
  total_users: number | null;
  devices: ZoomDevice[];
  devices_total: number;
  warnings: string[];
};

function credsKey(projectId: string) { return `zoom:creds:${projectId}`; }
function tokenKey(projectId: string) { return `zoom:token:${projectId}`; }

// ── Org-level (S2S) token ─────────────────────────────────────────────────────

const ORG_TOKEN_KEY = "zoom:org:token";
const PHOTO_CACHE_TTL = 86_400; // 24 hours

type OrgEnv = { ZOOM_ORG_ACCOUNT_ID?: string; ZOOM_ORG_CLIENT_ID?: string; ZOOM_ORG_CLIENT_SECRET?: string };

export async function getOrgToken(kv: KVNamespace, env: OrgEnv): Promise<string> {
  const cached = await kv.get<TokenCache>(ORG_TOKEN_KEY, "json");
  if (cached && cached.expires_at > Date.now() + 60_000) return cached.access_token;

  const { ZOOM_ORG_ACCOUNT_ID, ZOOM_ORG_CLIENT_ID, ZOOM_ORG_CLIENT_SECRET } = env;
  if (!ZOOM_ORG_ACCOUNT_ID || !ZOOM_ORG_CLIENT_ID || !ZOOM_ORG_CLIENT_SECRET) {
    throw new Error("Zoom org credentials not configured");
  }

  const res = await fetch(
    `${ZOOM_OAUTH_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(ZOOM_ORG_ACCOUNT_ID)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${ZOOM_ORG_CLIENT_ID}:${ZOOM_ORG_CLIENT_SECRET}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  if (!res.ok) throw new Error(`Zoom org token fetch failed: ${res.status} ${await res.text()}`);

  const data = await res.json() as { access_token: string; expires_in: number };
  await kv.put(
    ORG_TOKEN_KEY,
    JSON.stringify({ access_token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 }),
    { expirationTtl: data.expires_in - 60 }
  );
  return data.access_token;
}

export async function getStaffPhotos(
  kv: KVNamespace,
  env: OrgEnv,
  emails: string[]
): Promise<Record<string, string | null>> {
  if (emails.length === 0) return {};

  const result: Record<string, string | null> = {};
  const toFetch: string[] = [];

  // Check KV cache first
  await Promise.all(
    emails.map(async (email) => {
      const cached = await kv.get(`zoom:photo:${email.toLowerCase()}`);
      if (cached !== null) {
        result[email] = cached === "" ? null : cached;
      } else {
        toFetch.push(email);
      }
    })
  );

  if (toFetch.length === 0) return result;

  const token = await getOrgToken(kv, env);

  await Promise.all(
    toFetch.map(async (email) => {
      try {
        const res = await fetch(`${ZOOM_API_BASE}/users/${encodeURIComponent(email)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          await kv.put(`zoom:photo:${email.toLowerCase()}`, "", { expirationTtl: PHOTO_CACHE_TTL });
          result[email] = null;
          return;
        }
        const data = await res.json() as { pic_url?: string };
        const url = data.pic_url ?? null;
        await kv.put(`zoom:photo:${email.toLowerCase()}`, url ?? "", { expirationTtl: PHOTO_CACHE_TTL });
        result[email] = url;
      } catch {
        result[email] = null;
      }
    })
  );

  return result;
}

export async function saveCreds(kv: KVNamespace, projectId: string, creds: ZoomCreds): Promise<void> {
  await kv.put(credsKey(projectId), JSON.stringify(creds));
}

export async function deleteCreds(kv: KVNamespace, projectId: string): Promise<void> {
  await Promise.all([kv.delete(credsKey(projectId)), kv.delete(tokenKey(projectId))]);
}

export async function getCredsConfigured(kv: KVNamespace, projectId: string): Promise<boolean> {
  return (await kv.get(credsKey(projectId))) !== null;
}

async function getCreds(kv: KVNamespace, projectId: string): Promise<ZoomCreds | null> {
  return kv.get<ZoomCreds>(credsKey(projectId), "json");
}

async function getToken(kv: KVNamespace, creds: ZoomCreds, projectId: string): Promise<string> {
  const cached = await kv.get<TokenCache>(tokenKey(projectId), "json");
  if (cached && cached.expires_at > Date.now() + 60_000) return cached.access_token;

  const res = await fetch(
    `${ZOOM_OAUTH_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(creds.account_id)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${creds.client_id}:${creds.client_secret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  if (!res.ok) throw new Error(`Zoom token fetch failed: ${res.status} ${await res.text()}`);

  const data = await res.json() as { access_token: string; expires_in: number };
  await kv.put(
    tokenKey(projectId),
    JSON.stringify({ access_token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 }),
    { expirationTtl: data.expires_in - 60 }
  );
  return data.access_token;
}

async function zoomGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${ZOOM_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Zoom API ${res.status} ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

function settled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

export async function getZoomStatus(kv: KVNamespace, projectId: string): Promise<ZoomStatus | null> {
  const creds = await getCreds(kv, projectId);
  if (!creds) return null;

  const token = await getToken(kv, creds, projectId);

  const [accountRes, plansRes, usersRes, devicesRes] = await Promise.allSettled([
    zoomGet<{ id: string; account_name: string; account_type: number }>(token, "/accounts/me"),
    zoomGet<Record<string, unknown>>(token, "/accounts/me/plans"),
    zoomGet<{ total_records: number }>(token, "/users?page_size=1"),
    zoomGet<{ devices?: ZoomDevice[]; total_records: number }>(token, "/phone/devices?page_size=100"),
  ]);

  if (accountRes.status === "rejected") {
    throw new Error(`Zoom account lookup failed: ${accountRes.reason}`);
  }

  const warnings: string[] = [];
  const checks: [PromiseSettledResult<unknown>, string][] = [
    [plansRes, "/accounts/me/plans"],
    [usersRes, "/users"],
    [devicesRes, "/phone/devices"],
  ];
  for (const [res, label] of checks) {
    if (res.status === "rejected") warnings.push(`${label}: ${(res as PromiseRejectedResult).reason}`);
  }

  const accountData = accountRes.value;
  const devicesData = settled(devicesRes);

  return {
    account: {
      id: accountData.id,
      account_name: accountData.account_name,
      account_type: accountData.account_type,
    },
    plans: settled(plansRes) ?? {},
    total_users: settled(usersRes)?.total_records ?? null,
    devices: devicesData?.devices ?? [],
    devices_total: devicesData?.total_records ?? 0,
    warnings,
  };
}
