const DYNAMICS_API_BASE = "https://packetfusioncrm.crm.dynamics.com/api/data/v9.2";
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

function getDynamicsToken(env: GraphEnv) {
  return fetchToken(env, "https://packetfusioncrm.crm.dynamics.com/.default", DYNAMICS_TOKEN_KEY);
}


// ── SharePoint REST API (/_api) ───────────────────────────────────────────────
//
// Uses a SharePoint-scoped token (Sites.ReadWrite.All on the SharePoint API
// resource) rather than the Graph API. This avoids tenant-level conditional
// access policies that can block Graph app-only access to SharePoint even
// when the token has the correct roles.
//
// Token scope: https://{tenant}.sharepoint.com/.default
// Endpoints:   https://{tenant}.sharepoint.com/_api/web/GetFolder.../

function spOrigin(url: string): string {
  return new URL(url).origin; // "https://packetfusioncrm.sharepoint.com"
}

function getSPToken(env: GraphEnv, folderUrl: string): Promise<string> {
  const origin = spOrigin(folderUrl);
  return fetchToken(env, `${origin}/.default`, `sp:token:${origin}`);
}

// Encode a server-relative path for use in SP REST OData function parameters.
// Each segment is decoded then re-encoded so spaces become %20 without double-encoding.
function encodeSPPath(serverRelativePath: string): string {
  return serverRelativePath
    .split("/")
    .map((seg) => { try { return encodeURIComponent(decodeURIComponent(seg)); } catch { return seg; } })
    .join("/");
}

async function spFetch<T>(token: string, url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
      ...((options?.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SharePoint REST ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

type SPFileRaw = {
  UniqueId: string;
  Name: string;
  Length: string;
  TimeLastModified: string;
  ServerRelativeUrl: string;
};

type SPFolderRaw = {
  UniqueId: string;
  Name: string;
  ServerRelativeUrl: string;
};

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
  const origin = spOrigin(folderAbsoluteUrl);
  const token = await getSPToken(env, folderAbsoluteUrl);
  const serverPath = encodeSPPath(new URL(folderAbsoluteUrl).pathname);

  const [filesRes, foldersRes] = await Promise.all([
    spFetch<{ value: SPFileRaw[] }>(
      token,
      `${origin}/_api/web/GetFolderByServerRelativeUrl('${serverPath}')/Files?$select=UniqueId,Name,Length,TimeLastModified,ServerRelativeUrl&$orderby=Name asc`
    ),
    spFetch<{ value: SPFolderRaw[] }>(
      token,
      `${origin}/_api/web/GetFolderByServerRelativeUrl('${serverPath}')/Folders?$select=UniqueId,Name,ServerRelativeUrl&$orderby=Name asc`
    ),
  ]);

  const items: SPFile[] = [];

  for (const folder of foldersRes.value) {
    if (folder.Name === "Forms") continue; // skip internal SP system folder
    items.push({
      id: folder.UniqueId,
      name: folder.Name,
      size: null,
      lastModified: null,
      webUrl: origin + folder.ServerRelativeUrl,
      downloadUrl: null,
      isFolder: true,
      mimeType: null,
    });
  }

  for (const file of filesRes.value) {
    const webUrl = origin + file.ServerRelativeUrl;
    items.push({
      id: file.UniqueId,
      name: file.Name,
      size: Number(file.Length) || null,
      lastModified: file.TimeLastModified || null,
      webUrl,
      downloadUrl: webUrl, // SP web URL works as download link when user has SP session
      isFolder: false,
      mimeType: null,
    });
  }

  return items;
}

export async function uploadToSharePoint(
  env: GraphEnv,
  folderAbsoluteUrl: string,
  filename: string,
  content: ArrayBuffer,
  mimeType: string
): Promise<SPFile> {
  const origin = spOrigin(folderAbsoluteUrl);
  const token = await getSPToken(env, folderAbsoluteUrl);
  const serverPath = encodeSPPath(new URL(folderAbsoluteUrl).pathname);
  const encodedFilename = encodeURIComponent(filename);

  const res = await fetch(
    `${origin}/_api/web/GetFolderByServerRelativeUrl('${serverPath}')/Files/Add(overwrite=true,url='${encodedFilename}')`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json;odata=nometadata",
      },
      body: content,
    }
  );

  if (!res.ok) {
    throw new Error(`SharePoint upload ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const data = await res.json() as SPFileRaw;
  const webUrl = origin + data.ServerRelativeUrl;
  return {
    id: data.UniqueId,
    name: data.Name,
    size: Number(data.Length) || null,
    lastModified: data.TimeLastModified || null,
    webUrl,
    downloadUrl: webUrl,
    isFolder: false,
    mimeType,
  };
}

export async function deleteSharePointFile(
  env: GraphEnv,
  fileWebUrl: string
): Promise<void> {
  const origin = spOrigin(fileWebUrl);
  const token = await getSPToken(env, fileWebUrl);
  const serverPath = encodeSPPath(new URL(fileWebUrl).pathname);

  const res = await fetch(
    `${origin}/_api/web/GetFileByServerRelativeUrl('${serverPath}')`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-HTTP-Method": "DELETE",
        "If-Match": "*",
      },
    }
  );

  if (!res.ok && res.status !== 204) {
    throw new Error(`SharePoint delete ${res.status}: ${await res.text().catch(() => "")}`);
  }
}
