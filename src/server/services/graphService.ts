const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const DYNAMICS_API_BASE = "https://packetfusioncrm.crm.dynamics.com/api/data/v9.2";
const GRAPH_TOKEN_KEY = "graph:token";
const DYNAMICS_TOKEN_KEY = "dynamics_token";

type TokenCache = { access_token: string; expires_at: number };

type GraphEnv = {
  KV: KVNamespace;
  DYNAMICS_TENANT_ID?: string;
  DYNAMICS_CLIENT_ID?: string;
  DYNAMICS_CLIENT_SECRET?: string;
};

export type SPLocation = {
  id: string;
  name: string;
  absoluteUrl: string;
};

export type SPFile = {
  id: string;
  name: string;
  size: number | null;
  lastModified: string | null;
  webUrl: string;
  downloadUrl: string | null;
  isFolder: boolean;
  mimeType: string | null;
};

// ── Token helpers ──────────────────────────────────────────────────────────────

async function fetchToken(env: GraphEnv, scope: string, cacheKey: string): Promise<string> {
  const cached = await env.KV.get<TokenCache>(cacheKey, "json");
  if (cached && cached.expires_at > Date.now() + 60_000) return cached.access_token;

  const res = await fetch(
    `https://login.microsoftonline.com/${env.DYNAMICS_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: env.DYNAMICS_CLIENT_ID!,
        client_secret: env.DYNAMICS_CLIENT_SECRET!,
        scope,
      }),
    }
  );

  if (!res.ok) throw new Error(`Token fetch failed (${scope}): ${res.status} ${await res.text()}`);

  const data = await res.json() as { access_token: string; expires_in: number };
  await env.KV.put(
    cacheKey,
    JSON.stringify({ access_token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 }),
    { expirationTtl: data.expires_in - 60 }
  );
  return data.access_token;
}

function getGraphToken(env: GraphEnv) {
  return fetchToken(env, "https://graph.microsoft.com/.default", GRAPH_TOKEN_KEY);
}

function getDynamicsToken(env: GraphEnv) {
  return fetchToken(env, "https://packetfusioncrm.crm.dynamics.com/.default", DYNAMICS_TOKEN_KEY);
}

// ── Graph API helpers ──────────────────────────────────────────────────────────

async function graphGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GRAPH_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Graph API ${res.status} ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function graphPut<T>(token: string, path: string, body: ArrayBuffer, contentType: string): Promise<T> {
  const res = await fetch(`${GRAPH_API_BASE}${path}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph PUT ${res.status} ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── SharePoint URL encoding for the /shares endpoint ──────────────────────────

function encodeShareUrl(url: string): string {
  // Microsoft Graph shares token: base64url("u!" + url)
  const b64 = btoa("u!" + url);
  return b64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// ── Dynamics document location resolution ─────────────────────────────────────

type DynSPLocation = {
  sharepointdocumentlocationid: string;
  name: string;
  relativeurl: string;
  absoluteurl: string | null;
  _parentsiteorlocation_value: string | null;
};

type DynSPSite = {
  sharepointsiteid: string;
  absoluteurl: string;
};

async function dynamicsGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${DYNAMICS_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Accept: "application/json",
      Prefer: "odata.include-annotations=OData.Community.Display.V1.FormattedValue",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Dynamics API ${res.status} ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// Walk up the parent chain to build the full absolute URL for a location
// that doesn't have absoluteurl populated.
async function buildAbsoluteUrl(
  token: string,
  location: DynSPLocation,
  visited = new Set<string>()
): Promise<string | null> {
  if (location.absoluteurl) return location.absoluteurl;
  if (!location._parentsiteorlocation_value) return null;
  if (visited.has(location._parentsiteorlocation_value)) return null;
  visited.add(location._parentsiteorlocation_value);

  // Try as a document location first
  try {
    const res = await dynamicsGet<{ value: DynSPLocation[] }>(
      token,
      `/sharepointdocumentlocations?$filter=sharepointdocumentlocationid eq ${location._parentsiteorlocation_value}&$select=sharepointdocumentlocationid,relativeurl,absoluteurl,_parentsiteorlocation_value`
    );
    const parent = res.value[0];
    if (parent) {
      const parentUrl = await buildAbsoluteUrl(token, parent, visited);
      return parentUrl ? `${parentUrl.replace(/\/$/, "")}/${location.relativeurl}` : null;
    }
  } catch { /* might be a site, not a location */ }

  // Try as a SharePoint site
  try {
    const res = await dynamicsGet<{ value: DynSPSite[] }>(
      token,
      `/sharepointsites?$filter=sharepointsiteid eq ${location._parentsiteorlocation_value}&$select=absoluteurl`
    );
    const site = res.value[0];
    if (site?.absoluteurl) {
      return `${site.absoluteurl.replace(/\/$/, "")}/${location.relativeurl}`;
    }
  } catch { /* ignore */ }

  return null;
}

export async function getSharePointLocations(env: GraphEnv, recordId: string): Promise<SPLocation[]> {
  const token = await getDynamicsToken(env);

  const res = await dynamicsGet<{ value: DynSPLocation[] }>(
    token,
    `/sharepointdocumentlocations?$filter=_regardingobjectid_value eq ${recordId} and servicetype eq 0&$select=sharepointdocumentlocationid,name,relativeurl,absoluteurl,_parentsiteorlocation_value&$orderby=name asc`
  );

  const locations: SPLocation[] = [];
  for (const loc of res.value) {
    const absoluteUrl = await buildAbsoluteUrl(token, loc);
    if (absoluteUrl) {
      locations.push({ id: loc.sharepointdocumentlocationid, name: loc.name, absoluteUrl });
    }
  }
  return locations;
}

// ── File operations ────────────────────────────────────────────────────────────

export async function listSharePointFiles(env: GraphEnv, folderAbsoluteUrl: string): Promise<SPFile[]> {
  const token = await getGraphToken(env);
  const encoded = encodeShareUrl(folderAbsoluteUrl);

  const res = await graphGet<{
    value: Array<{
      id: string;
      name: string;
      size?: number;
      lastModifiedDateTime?: string;
      webUrl?: string;
      "@microsoft.graph.downloadUrl"?: string;
      folder?: object;
      file?: { mimeType?: string };
    }>;
  }>(token, `/shares/${encoded}/driveItem/children?$orderby=name asc`);

  return res.value.map((item) => ({
    id: item.id,
    name: item.name,
    size: item.size ?? null,
    lastModified: item.lastModifiedDateTime ?? null,
    webUrl: item.webUrl ?? "",
    downloadUrl: item["@microsoft.graph.downloadUrl"] ?? null,
    isFolder: !!item.folder,
    mimeType: item.file?.mimeType ?? null,
  }));
}

export async function uploadToSharePoint(
  env: GraphEnv,
  folderAbsoluteUrl: string,
  filename: string,
  content: ArrayBuffer,
  mimeType: string
): Promise<SPFile> {
  const token = await getGraphToken(env);
  const encoded = encodeShareUrl(folderAbsoluteUrl);

  // Get the folder's driveItem to obtain its drive ID and item ID
  const folder = await graphGet<{
    id: string;
    parentReference: { driveId: string };
  }>(token, `/shares/${encoded}/driveItem`);

  const driveId = folder.parentReference.driveId;
  const folderId = folder.id;

  const item = await graphPut<{
    id: string;
    name: string;
    size: number;
    webUrl: string;
    lastModifiedDateTime?: string;
    "@microsoft.graph.downloadUrl"?: string;
    file?: { mimeType?: string };
  }>(
    token,
    `/drives/${driveId}/items/${folderId}:/${encodeURIComponent(filename)}:/content`,
    content,
    mimeType
  );

  return {
    id: item.id,
    name: item.name,
    size: item.size,
    lastModified: item.lastModifiedDateTime ?? null,
    webUrl: item.webUrl,
    downloadUrl: item["@microsoft.graph.downloadUrl"] ?? null,
    isFolder: false,
    mimeType: item.file?.mimeType ?? null,
  };
}

export async function deleteSharePointFile(
  env: GraphEnv,
  fileWebUrl: string
): Promise<void> {
  const token = await getGraphToken(env);
  const encoded = encodeShareUrl(fileWebUrl);

  const item = await graphGet<{ id: string; parentReference: { driveId: string } }>(
    token, `/shares/${encoded}/driveItem`
  );

  const res = await fetch(
    `${GRAPH_API_BASE}/drives/${item.parentReference.driveId}/items/${item.id}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok && res.status !== 204) {
    throw new Error(`Graph DELETE ${res.status}: ${await res.text().catch(() => "")}`);
  }
}
