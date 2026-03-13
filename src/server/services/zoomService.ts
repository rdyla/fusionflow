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
  licenses: {
    plan_name: string;
    total_seats: number;
    phone_plans: { type: string; hosts: number }[];
  };
  users: {
    active: number;
    inactive: number;
  };
  phone: {
    total_users: number | null;
  };
  devices: ZoomDevice[];
  devices_total: number;
};

function credsKey(projectId: string) { return `zoom:creds:${projectId}`; }
function tokenKey(projectId: string) { return `zoom:token:${projectId}`; }

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

  // Use allSettled so missing Zoom Phone license doesn't abort everything
  const [accountRes, plansRes, activeRes, inactiveRes, phoneUsersRes, devicesRes] = await Promise.allSettled([
    zoomGet<{ id: string; account_name: string; account_type: number }>(token, "/accounts/me"),
    zoomGet<{
      plan_base?: { type: string; hosts: number };
      plan_zoom_phone?: { type: string; hosts: number }[];
    }>(token, "/accounts/me/plans"),
    zoomGet<{ total_records: number }>(token, "/users?status=active&page_size=1"),
    zoomGet<{ total_records: number }>(token, "/users?status=inactive&page_size=1"),
    zoomGet<{ total_records: number }>(token, "/phone/users?page_size=1"),
    zoomGet<{ devices?: ZoomDevice[]; total_records: number }>(token, "/phone/devices?page_size=100"),
  ]);

  // Account is the critical call — surface the error if it fails
  if (accountRes.status === "rejected") {
    throw new Error(`Zoom account lookup failed: ${accountRes.reason}`);
  }

  const accountData = accountRes.value;
  const plansData = settled(plansRes);
  const activeUsers = settled(activeRes);
  const inactiveUsers = settled(inactiveRes);
  const phoneUsers = settled(phoneUsersRes);
  const devicesData = settled(devicesRes);

  return {
    account: {
      id: accountData.id,
      account_name: accountData.account_name,
      account_type: accountData.account_type,
    },
    licenses: {
      plan_name: plansData?.plan_base?.type ?? "Unknown",
      total_seats: plansData?.plan_base?.hosts ?? 0,
      phone_plans: plansData?.plan_zoom_phone ?? [],
    },
    users: {
      active: activeUsers?.total_records ?? 0,
      inactive: inactiveUsers?.total_records ?? 0,
    },
    phone: {
      total_users: phoneUsers?.total_records ?? null,
    },
    devices: devicesData?.devices ?? [],
    devices_total: devicesData?.total_records ?? 0,
  };
}
