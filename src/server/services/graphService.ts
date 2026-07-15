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
  APP_URL?: string;
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
  /** SP driveItem `description` — used to capture PM-supplied context like
   *  "phone bill — March 2026" or "discovery workbook v2". Stored on SP
   *  itself (not in our DB), so it's also visible from the SharePoint web UI. */
  description: string | null;
  /** Author / uploader identity from Graph. SP populates these from the
   *  app's authenticating principal — since we use app-only auth, the
   *  display name is typically the app's name. Better than nothing as a
   *  "last touched by" hint; PMs can correlate to the upload timestamp. */
  createdAt: string | null;
  createdByName: string | null;
  modifiedByName: string | null;
  /** App-side overlay (folders only): whether this folder is shared with the
   *  customer-facing roles (client / partner_ae). Set by the /files route from
   *  sharepoint_folder_visibility; undefined for files / when not overlaid. */
  visibleToClient?: boolean;
  /** App-side overlay (files, external viewers only): the current external user
   *  has been granted edit access covering this file, so the UI can offer an
   *  "Edit online" link. Set by the /files route from sharepoint_edit_grants. */
  canEditOnline?: boolean;
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

async function graphPostJson<T>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${GRAPH_API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph POST ${res.status} ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── SharePoint URL resolution via Graph site + drive ──────────────────────────
//
// Microsoft Graph is the preferred modern API for SharePoint access.
// Resolves folder URLs by navigating the site → drive → path hierarchy,
// which works reliably once DisableCustomAppAuthentication = false is set
// on the tenant (Set-PnPTenant -DisableCustomAppAuthentication $false).
//
// 1. GET /sites/{hostname}        → site ID
// 2. GET /sites/{id}/drives       → find document library by name (first URL segment)
// 3. /drives/{id}/root:/{path}:/  → list / upload / delete

async function resolveSharePointPath(token: string, url: string): Promise<{ driveId: string; segments: string[] }> {
  const parsed = new URL(url);
  const hostname = parsed.hostname;

  const allSegments = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((s) => { try { return decodeURIComponent(s); } catch { return s; } });

  if (allSegments.length === 0) throw new Error(`SharePoint URL has no path: ${url}`);

  const libraryName = allSegments[0];
  const pathWithinDrive = allSegments.slice(1);

  const site = await graphGet<{ id: string }>(token, `/sites/${hostname}`);

  const drivesRes = await graphGet<{ value: Array<{ id: string; name: string }> }>(
    token, `/sites/${site.id}/drives`
  );

  const drive = drivesRes.value.find(
    (d) => d.name.toLowerCase() === libraryName.toLowerCase()
  );

  if (!drive) {
    const names = drivesRes.value.map((d) => d.name).join(", ");
    throw new Error(`Document library "${libraryName}" not found on ${hostname}. Available: ${names}`);
  }

  return { driveId: drive.id, segments: pathWithinDrive };
}

function graphPath(segments: string[]): string {
  return segments.map(encodeURIComponent).join("/");
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

async function buildAbsoluteUrl(
  token: string,
  location: DynSPLocation,
  visited = new Set<string>()
): Promise<string | null> {
  if (location.absoluteurl) return location.absoluteurl;
  if (!location._parentsiteorlocation_value) return null;
  if (visited.has(location._parentsiteorlocation_value)) return null;
  visited.add(location._parentsiteorlocation_value);

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
  let token: string;
  try {
    token = await getDynamicsToken(env);
  } catch (err) {
    console.error("getSharePointLocations: token error", err instanceof Error ? err.message : err);
    return [];
  }

  let res: { value: DynSPLocation[] };
  try {
    res = await dynamicsGet<{ value: DynSPLocation[] }>(
      token,
      `/sharepointdocumentlocations?$filter=_regardingobjectid_value eq ${recordId}&$select=sharepointdocumentlocationid,name,relativeurl,absoluteurl,_parentsiteorlocation_value&$orderby=name asc`
    );
  } catch (err) {
    console.error("getSharePointLocations: Dynamics query error for", recordId, err instanceof Error ? err.message : err);
    return [];
  }

  const locations: SPLocation[] = [];
  for (const loc of res.value) {
    try {
      const absoluteUrl = await buildAbsoluteUrl(token, loc);
      if (absoluteUrl) {
        locations.push({ id: loc.sharepointdocumentlocationid, name: loc.name, absoluteUrl });
      }
    } catch (err) {
      console.error("getSharePointLocations: buildAbsoluteUrl error for", loc.name, err instanceof Error ? err.message : err);
    }
  }
  return locations;
}

// ── File operations via Microsoft Graph ────────────────────────────────────────

type GraphIdentitySet = {
  user?: { displayName?: string; email?: string };
  application?: { displayName?: string };
};

type GraphDriveItem = {
  id: string;
  name: string;
  size?: number;
  description?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  webUrl?: string;
  "@microsoft.graph.downloadUrl"?: string;
  folder?: object;
  file?: { mimeType?: string };
  createdBy?: GraphIdentitySet;
  lastModifiedBy?: GraphIdentitySet;
};

function identityName(set: GraphIdentitySet | undefined): string | null {
  if (!set) return null;
  return set.user?.displayName ?? set.user?.email ?? set.application?.displayName ?? null;
}

function mapDriveItem(item: GraphDriveItem): SPFile {
  return {
    id: item.id,
    name: item.name,
    size: item.size ?? null,
    lastModified: item.lastModifiedDateTime ?? null,
    webUrl: item.webUrl ?? "",
    downloadUrl: item["@microsoft.graph.downloadUrl"] ?? null,
    isFolder: !!item.folder,
    mimeType: item.file?.mimeType ?? null,
    description: item.description ?? null,
    createdAt: item.createdDateTime ?? null,
    createdByName: identityName(item.createdBy),
    modifiedByName: identityName(item.lastModifiedBy),
  };
}

export async function listSharePointFiles(env: GraphEnv, folderAbsoluteUrl: string): Promise<SPFile[]> {
  const token = await getGraphToken(env);
  const { driveId, segments } = await resolveSharePointPath(token, folderAbsoluteUrl);

  const encodedPath = graphPath(segments);
  const apiPath = encodedPath
    ? `/drives/${driveId}/root:/${encodedPath}:/children?$orderby=name asc`
    : `/drives/${driveId}/root/children?$orderby=name asc`;

  const res = await graphGet<{ value: GraphDriveItem[] }>(token, apiPath);
  return res.value.map(mapDriveItem);
}

async function graphPatchJson<T>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${GRAPH_API_BASE}${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph PATCH ${res.status} ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function uploadToSharePoint(
  env: GraphEnv,
  folderAbsoluteUrl: string,
  filename: string,
  content: ArrayBuffer,
  mimeType: string,
  description?: string | null
): Promise<SPFile> {
  const token = await getGraphToken(env);
  const { driveId, segments } = await resolveSharePointPath(token, folderAbsoluteUrl);

  const encodedPath = graphPath(segments);
  const uploadPath = encodedPath
    ? `/drives/${driveId}/root:/${encodedPath}/${encodeURIComponent(filename)}:/content`
    : `/drives/${driveId}/root:/${encodeURIComponent(filename)}:/content`;

  let item = await graphPut<GraphDriveItem>(token, uploadPath, content, mimeType);

  // Description is set in a second PATCH because PUT-content endpoint doesn't
  // accept metadata. Best-effort: if PATCH fails, the file is still uploaded.
  const trimmed = description?.trim();
  if (trimmed) {
    try {
      item = await graphPatchJson<GraphDriveItem>(token, `/drives/${driveId}/items/${item.id}`, {
        description: trimmed,
      });
    } catch (err) {
      console.warn(`[uploadToSharePoint] description PATCH failed for ${item.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return mapDriveItem(item);
}

/**
 * Create a Graph resumable upload session for a file in a SharePoint folder.
 * Returns a pre-authenticated `uploadUrl` that the BROWSER uploads chunks to
 * directly — so the file bytes never pass through the Cloudflare Worker, which
 * removes the Worker's ~100 MB request-body / 128 MB memory ceiling and lets
 * uploads go up to SharePoint's real limit. Used for large files; small files
 * still take the simple PUT path (uploadToSharePoint).
 *
 * conflictBehavior "replace" mirrors the simple-upload path (re-uploading the
 * same filename overwrites, matching the ON CONFLICT REPLACE attribution).
 */
export async function createSharePointUploadSession(
  env: GraphEnv,
  folderAbsoluteUrl: string,
  filename: string,
): Promise<{ uploadUrl: string; expirationDateTime: string | null }> {
  const token = await getGraphToken(env);
  const { driveId, segments } = await resolveSharePointPath(token, folderAbsoluteUrl);
  const encodedPath = graphPath(segments);
  const sessionPath = encodedPath
    ? `/drives/${driveId}/root:/${encodedPath}/${encodeURIComponent(filename)}:/createUploadSession`
    : `/drives/${driveId}/root:/${encodeURIComponent(filename)}:/createUploadSession`;
  const session = await graphPostJson<{ uploadUrl: string; expirationDateTime?: string }>(
    token,
    sessionPath,
    { item: { "@microsoft.graph.conflictBehavior": "replace", name: filename } },
  );
  return { uploadUrl: session.uploadUrl, expirationDateTime: session.expirationDateTime ?? null };
}

/**
 * Update the description on an existing SharePoint file. Used by the
 * PATCH /api/sharepoint/file/description endpoint so PMs can backfill
 * context on files uploaded via the SharePoint web UI directly (no
 * description) or correct mistakes.
 *
 * Pass an empty string (or null) to clear the description.
 */
export async function updateSharePointFileDescription(
  env: GraphEnv,
  fileWebUrl: string,
  description: string | null
): Promise<SPFile> {
  const token = await getGraphToken(env);
  const { driveId, segments } = await resolveSharePointPath(token, fileWebUrl);
  const encodedPath = graphPath(segments);
  const lookup = await graphGet<{ id: string }>(token, `/drives/${driveId}/root:/${encodedPath}`);
  const trimmed = description?.trim() ?? "";
  const item = await graphPatchJson<GraphDriveItem>(token, `/drives/${driveId}/items/${lookup.id}`, {
    description: trimmed, // Graph treats empty string as "clear"
  });
  return mapDriveItem(item);
}

export async function downloadSharePointFile(
  env: GraphEnv,
  fileWebUrl: string
): Promise<{ name: string; mimeType: string; content: ArrayBuffer }> {
  const token = await getGraphToken(env);
  const { driveId, segments } = await resolveSharePointPath(token, fileWebUrl);
  const encodedPath = graphPath(segments);
  const item = await graphGet<GraphDriveItem>(token, `/drives/${driveId}/root:/${encodedPath}`);
  const downloadUrl = item["@microsoft.graph.downloadUrl"];
  if (!downloadUrl) throw new Error(`No download URL for SharePoint file: ${fileWebUrl}`);
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error(`SharePoint download failed (${res.status}) for ${fileWebUrl}`);
  return {
    name: item.name,
    mimeType: item.file?.mimeType ?? "application/octet-stream",
    content: await res.arrayBuffer(),
  };
}

/**
 * Create (or reuse) a child folder under a SharePoint parent.
 *
 * Returns the absolute URL of the resulting folder — usable directly as a
 * folderAbsoluteUrl by the other helpers in this file.
 *
 * Reuse semantics: when a folder with the same name already exists under
 * the parent (case-insensitive match), its existing URL is returned instead
 * of creating a duplicate. This is Ryan's preference for handling name
 * collisions on project creation — customers occasionally pre-create
 * project folders, and we'd rather adopt them than create "Project 1".
 *
 * If the parent itself doesn't exist or isn't a folder, Graph returns 404
 * here and the error bubbles up. Callers should treat folder creation as
 * best-effort and not block the calling business action on failure.
 */
/**
 * Sanitize a folder name for SharePoint Online. SP rejects names containing
 * `" * : < > ? / \ |` and names that are just dots, plus leading/trailing
 * spaces or dots. Replace each banned char with `-`, collapse runs, trim.
 * Returns an empty string if nothing usable survives — callers should treat
 * that as a hard error.
 */
function sanitizeSharePointName(raw: string): string {
  const replaced = raw.replace(/[\\/:*?"<>|]+/g, "-").replace(/-{2,}/g, "-");
  return replaced.replace(/^[\s.]+|[\s.]+$/g, "").trim();
}

export async function ensureSharePointChildFolder(
  env: GraphEnv,
  parentAbsoluteUrl: string,
  childName: string
): Promise<{ webUrl: string; id: string; reused: boolean }> {
  const sanitized = sanitizeSharePointName(childName);
  if (!sanitized) throw new Error(`childName "${childName}" sanitizes to an empty SharePoint folder name`);
  const token = await getGraphToken(env);
  const { driveId, segments } = await resolveSharePointPath(token, parentAbsoluteUrl);
  const parentPath = graphPath(segments);

  // 1. Look for an existing child with the same name (case-insensitive). Per
  // Ryan's preference, an exact-match existing folder is adopted as the
  // project's folder rather than creating "Foo 1".
  const listPath = parentPath
    ? `/drives/${driveId}/root:/${parentPath}:/children?$select=id,name,webUrl,folder&$top=1000`
    : `/drives/${driveId}/root/children?$select=id,name,webUrl,folder&$top=1000`;
  const listRes = await graphGet<{ value: GraphDriveItem[] }>(token, listPath);
  const lower = sanitized.toLowerCase();
  const existing = listRes.value.find(
    (it) => !!it.folder && it.name.trim().toLowerCase() === lower
  );
  if (existing) {
    return { webUrl: existing.webUrl ?? "", id: existing.id, reused: true };
  }

  // 2. Otherwise create it. conflictBehavior=fail because we already checked;
  // if a race created it between our list + post, surface the error rather
  // than silently rename to "Foo 1".
  const createPath = parentPath
    ? `/drives/${driveId}/root:/${parentPath}:/children`
    : `/drives/${driveId}/root/children`;
  const item = await graphPostJson<GraphDriveItem>(token, createPath, {
    name: sanitized,
    folder: {},
    "@microsoft.graph.conflictBehavior": "fail",
  });
  return { webUrl: item.webUrl ?? "", id: item.id, reused: false };
}

/**
 * Auto-create a phase-level SharePoint sub-folder under its project's
 * main folder. Idempotent — returns the existing URL when already set.
 *
 * Gates:
 *   - Project must have phase_scoped_visibility = 1 (single-phase
 *     projects keep using the project-level folder).
 *   - Project must already have its own sharepoint_folder_url set;
 *     otherwise we have no parent to nest under and skip.
 *
 * Returns the phase's webUrl when created/reused, or null when
 * skipped. Persists to phases.sharepoint_folder_url on success.
 *
 * Designed for fire-and-forget use via ctx.waitUntil() at phase
 * creation time so the API response isn't blocked on Graph latency.
 */
export async function ensurePhaseSharePointFolder(
  env: GraphEnv,
  db: D1Database,
  projectId: string,
  phaseId: string,
): Promise<string | null> {
  const project = await db
    .prepare(`SELECT phase_scoped_visibility, sharepoint_folder_url FROM projects WHERE id = ? LIMIT 1`)
    .bind(projectId)
    .first<{ phase_scoped_visibility: number | null; sharepoint_folder_url: string | null }>();
  if (!project) return null;
  if (!project.phase_scoped_visibility) return null;
  if (!project.sharepoint_folder_url) return null;

  const phase = await db
    .prepare(`SELECT name, sharepoint_folder_url FROM phases WHERE id = ? AND project_id = ? LIMIT 1`)
    .bind(phaseId, projectId)
    .first<{ name: string; sharepoint_folder_url: string | null }>();
  if (!phase) return null;
  if (phase.sharepoint_folder_url) return phase.sharepoint_folder_url; // idempotent

  // Duplicate-name protection. ensureSharePointChildFolder adopts an
  // existing same-named child folder when one exists — fine for projects
  // (one folder per project) but unsafe across phases: a second phase with
  // the same name as a first would silently end up sharing the first's
  // folder. PHASE_NAME has no uniqueness constraint at the DB level, so we
  // detect collisions ourselves and append a short phase-id suffix when a
  // sibling phase already holds the same name.
  const sibling = await db
    .prepare(`SELECT id FROM phases
              WHERE project_id = ? AND id != ? AND LOWER(TRIM(name)) = LOWER(TRIM(?))
              LIMIT 1`)
    .bind(projectId, phaseId, phase.name)
    .first();
  const folderName = sibling
    ? `${phase.name} (${phaseId.slice(0, 8)})`
    : phase.name;

  try {
    const folder = await ensureSharePointChildFolder(env, project.sharepoint_folder_url, folderName);
    await db
      .prepare(`UPDATE phases SET sharepoint_folder_url = ? WHERE id = ?`)
      .bind(folder.webUrl, phaseId)
      .run();
    return folder.webUrl;
  } catch (err) {
    // Don't fail phase creation if Graph is unreachable; the per-phase
    // "Create folder" retro-fit endpoint can pick it up later.
    console.warn(`[phaseSharePoint] Failed to create folder for phase ${phaseId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Give an EXTERNAL person edit access to a SharePoint item (file or folder) so
 * they can open + edit it in Office-for-the-web as themselves — the "customer
 * online editing with attribution" flow.
 *
 * Two steps:
 *  1. Ensure they exist as a B2B guest in our tenant (POST /invitations). Uses
 *     the app's User.Invite.All permission. Best-effort — if they're already a
 *     guest, Graph errors and we swallow it and proceed to the grant.
 *  2. Grant "write" on the item via the drive-item invite API, with
 *     requireSignIn=true (so edits are attributed to their guest identity) and
 *     sendInvitation=true (Graph emails them a direct link to the item).
 *
 * Granting on a FOLDER cascades to its children, so a single folder grant lets
 * the guest edit every document inside it.
 */
export async function inviteGuestAndGrantWrite(
  env: GraphEnv,
  itemWebUrl: string,
  email: string,
  displayName?: string | null
): Promise<{ invited: boolean; granted: boolean }> {
  const token = await getGraphToken(env);

  // 1. Provision the guest (idempotent-ish — ignore "already exists").
  let invited = false;
  try {
    await graphPostJson(token, "/invitations", {
      invitedUserEmailAddress: email,
      ...(displayName ? { invitedUserDisplayName: displayName } : {}),
      inviteRedirectUrl: env.APP_URL || "https://cloudconnect.packetfusion.com",
      sendInvitationMessage: false, // the item-invite below sends the useful email
    });
    invited = true;
  } catch (err) {
    console.warn(`[graph] guest invite for ${email} failed (likely already a guest):`, err instanceof Error ? err.message : err);
  }

  // 2. Grant write on the item (+ email them a direct link).
  const { driveId, segments } = await resolveSharePointPath(token, itemWebUrl);
  const encodedPath = graphPath(segments);
  const item = await graphGet<{ id: string }>(
    token,
    encodedPath ? `/drives/${driveId}/root:/${encodedPath}` : `/drives/${driveId}/root`
  );
  await graphPostJson(token, `/drives/${driveId}/items/${item.id}/invite`, {
    recipients: [{ email }],
    roles: ["write"],
    requireSignIn: true,
    sendInvitation: true,
    message: "You've been given access to edit this document for your Packet Fusion project.",
  });

  return { invited, granted: true };
}

export async function deleteSharePointFile(
  env: GraphEnv,
  fileWebUrl: string
): Promise<void> {
  const token = await getGraphToken(env);
  const { driveId, segments } = await resolveSharePointPath(token, fileWebUrl);

  const encodedPath = graphPath(segments);
  const item = await graphGet<{ id: string }>(token, `/drives/${driveId}/root:/${encodedPath}`);

  const res = await fetch(
    `${GRAPH_API_BASE}/drives/${driveId}/items/${item.id}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok && res.status !== 204) {
    throw new Error(`Graph DELETE ${res.status}: ${await res.text().catch(() => "")}`);
  }
}
