import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import {
  getSharePointLocations,
  listSharePointFiles,
  uploadToSharePoint,
  createSharePointUploadSession,
  deleteSharePointFile,
  updateSharePointFileDescription,
  ensureSharePointChildFolder,
  type SPFile,
} from "../services/graphService";
import { inPlaceholders } from "../lib/teamUtils";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Overlay per-file uploader attribution from `sharepoint_uploads` onto a
 * Graph-sourced SPFile[]. Files uploaded via the SP web UI directly aren't
 * shadowed in our table — those keep the Graph identity ("FusionFlow" /
 * "SharePoint App") which is honest about the fact that we don't know who
 * touched them outside our portal.
 */
async function overlayUploaderAttribution(db: D1Database, files: SPFile[]): Promise<SPFile[]> {
  const fileIds = files.filter((f) => !f.isFolder).map((f) => f.id);
  if (fileIds.length === 0) return files;
  const ph = inPlaceholders(fileIds);
  const rows = await db
    .prepare(`SELECT sp_item_id, uploaded_by_name, uploaded_by_email, uploaded_at
              FROM sharepoint_uploads WHERE sp_item_id IN (${ph})`)
    .bind(...fileIds)
    .all<{ sp_item_id: string; uploaded_by_name: string | null; uploaded_by_email: string | null; uploaded_at: string }>();
  const byId = new Map((rows.results ?? []).map((r) => [r.sp_item_id, r]));
  return files.map((f) => {
    const row = byId.get(f.id);
    if (!row) return f;
    return {
      ...f,
      createdAt: row.uploaded_at,
      createdByName: row.uploaded_by_name ?? f.createdByName,
    };
  });
}

/**
 * Append one row to the file-change history (sharepoint_file_events). Best-effort
 * — callers wrap in try/catch and never fail the upload on a history-write error.
 * action is derived: 'replace' if the file already has history, else 'upload'.
 */
async function logFileEvent(
  db: D1Database,
  ev: {
    spItemId: string;
    projectId: string;
    webUrl: string | null;
    filename: string | null;
    size: number | null;
    userId: string;
    userName: string | null;
    userEmail: string | null;
  }
): Promise<void> {
  const prior = await db
    .prepare("SELECT 1 FROM sharepoint_file_events WHERE sp_item_id = ? LIMIT 1")
    .bind(ev.spItemId)
    .first();
  const action = prior ? "replace" : "upload";
  await db
    .prepare(
      `INSERT INTO sharepoint_file_events
         (id, sp_item_id, project_id, web_url, filename, action, size, actor_user_id, actor_name, actor_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(crypto.randomUUID(), ev.spItemId, ev.projectId, ev.webUrl, ev.filename, action, ev.size, ev.userId, ev.userName, ev.userEmail)
    .run();
}

// GET /api/sharepoint/locations?recordId=xxx
// Returns all SharePoint document locations for a Dynamics CRM record ID
app.get("/locations", async (c) => {
  const recordId = c.req.query("recordId");
  if (!recordId) return c.json({ error: "recordId required" }, 400);

  try {
    const locations = await getSharePointLocations(c.env, recordId);
    return c.json({ locations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch SharePoint locations";
    console.error("SharePoint locations error:", message);
    return c.json({ error: message }, 500);
  }
});

/** Customer-facing roles — they see only folders a PM marked visible. */
function isExternalRole(role: string | undefined): boolean {
  return role === "client" || role === "partner_ae";
}

/** Overlay each FOLDER's client/partner visibility flag from
 *  sharepoint_folder_visibility (by sp_item_id). Files are untouched. */
async function overlayFolderVisibility(db: D1Database, files: SPFile[]): Promise<SPFile[]> {
  const folderIds = files.filter((f) => f.isFolder).map((f) => f.id);
  if (folderIds.length === 0) return files;
  const ph = inPlaceholders(folderIds);
  const rows = await db
    .prepare(`SELECT sp_item_id, visible_to_client FROM sharepoint_folder_visibility WHERE sp_item_id IN (${ph})`)
    .bind(...folderIds)
    .all<{ sp_item_id: string; visible_to_client: number }>();
  const visById = new Map((rows.results ?? []).map((r) => [r.sp_item_id, r.visible_to_client === 1]));
  return files.map((f) => (f.isFolder ? { ...f, visibleToClient: visById.get(f.id) === true } : f));
}

// GET /api/sharepoint/files?url=xxx
// Lists files in a SharePoint folder by its absolute URL. Overlays per-file
// uploader attribution + per-folder client visibility. For client/partner
// viewers, returns ONLY folders marked visible — plus files only when the
// currently-listed folder is itself a shared folder (so loose files at the
// project root stay internal).
app.get("/files", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ error: "url required" }, 400);
  const auth = c.get("auth");

  try {
    const raw = await listSharePointFiles(c.env, url);
    const withAttribution = await overlayUploaderAttribution(c.env.DB, raw);
    let files = await overlayFolderVisibility(c.env.DB, withAttribution);

    if (isExternalRole(auth?.role)) {
      // Is the folder being listed itself shared? (root project folder isn't,
      // so its loose files stay hidden.) Matched by web_url.
      const cur = await c.env.DB
        .prepare("SELECT visible_to_client FROM sharepoint_folder_visibility WHERE web_url = ? LIMIT 1")
        .bind(url)
        .first<{ visible_to_client: number }>();
      const currentFolderVisible = cur?.visible_to_client === 1;
      files = files.filter((f) => (f.isFolder ? f.visibleToClient === true : currentFolderVisible));
    }

    return c.json({ files });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list SharePoint files";
    console.error("SharePoint files error:", message);
    return c.json({ error: message }, 500);
  }
});

// POST /api/sharepoint/folder?url=<parentUrl>&projectId=xxx
// Body: { name: string }. Creates (or adopts) a child folder under the parent.
// New folders are NOT visible to client/partner by default (no visibility row).
app.post("/folder", async (c) => {
  const parentUrl = c.req.query("url");
  if (!parentUrl) return c.json({ error: "url required" }, 400);
  let body: { name?: string };
  try { body = await c.req.json(); } catch { return c.json({ error: "JSON body required" }, 400); }
  const name = (body.name ?? "").trim();
  if (!name) return c.json({ error: "name required" }, 400);

  try {
    const folder = await ensureSharePointChildFolder(c.env, parentUrl, name);
    return c.json({ folder });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create folder";
    console.error("SharePoint create-folder error:", message);
    return c.json({ error: message }, 500);
  }
});

// PATCH /api/sharepoint/folder/visibility
// Body: { sp_item_id, web_url, project_id?, solution_id?, visible: boolean }
// Upserts a folder's client/partner visibility. Editor-only (clients can't
// see the toggle; this guards the API regardless). project_id / solution_id
// just scope ownership — the filtering in /files keys on sp_item_id + web_url
// regardless, so the same row format serves both project and solution folders.
app.patch("/folder/visibility", async (c) => {
  const auth = c.get("auth");
  if (isExternalRole(auth?.role)) return c.json({ error: "Forbidden" }, 403);
  let body: { sp_item_id?: string; web_url?: string; project_id?: string | null; solution_id?: string | null; visible?: boolean };
  try { body = await c.req.json(); } catch { return c.json({ error: "JSON body required" }, 400); }
  if (!body.sp_item_id) return c.json({ error: "sp_item_id required" }, 400);

  try {
    await c.env.DB
      .prepare(
        `INSERT INTO sharepoint_folder_visibility
           (sp_item_id, project_id, solution_id, web_url, visible_to_client, set_by_user_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(sp_item_id) DO UPDATE SET
           project_id        = excluded.project_id,
           solution_id       = excluded.solution_id,
           web_url           = excluded.web_url,
           visible_to_client = excluded.visible_to_client,
           set_by_user_id    = excluded.set_by_user_id,
           updated_at        = CURRENT_TIMESTAMP`
      )
      .bind(body.sp_item_id, body.project_id ?? null, body.solution_id ?? null, body.web_url ?? null, body.visible ? 1 : 0, auth?.user?.id ?? null)
      .run();
    return c.json({ ok: true, visible: !!body.visible });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update folder visibility";
    console.error("SharePoint folder-visibility error:", message);
    return c.json({ error: message }, 500);
  }
});

// POST /api/sharepoint/upload?url=xxx&description=...&projectId=xxx
// Uploads a file to a SharePoint folder. Expects multipart/form-data with a "file" field.
// Description (optional) is set on the SP driveItem as a second PATCH after the content PUT.
// When projectId is provided, the upload is shadowed in sharepoint_uploads so
// we can attribute the upload to the authenticated user on subsequent list calls
// (Graph runs app-only so its createdBy is always the app principal).
app.post("/upload", async (c) => {
  const folderUrl = c.req.query("url");
  if (!folderUrl) return c.json({ error: "url required" }, 400);
  const description = c.req.query("description") ?? null;
  const projectId = c.req.query("projectId") ?? null;
  const auth = c.get("auth");

  try {
    const formData = await c.req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) return c.json({ error: "file field required" }, 400);

    const content = await file.arrayBuffer();
    const uploaded = await uploadToSharePoint(
      c.env,
      folderUrl,
      file.name,
      content,
      file.type || "application/octet-stream",
      description
    );

    // Shadow attribution so the file row shows who actually uploaded. Skipped
    // when projectId is missing — old callers continue to work but get the
    // app-principal name in the UI. ON CONFLICT REPLACE handles re-uploads
    // (same filename → same sp_item_id) so the latest uploader wins.
    if (projectId && auth?.user) {
      try {
        await c.env.DB
          .prepare(
            `INSERT INTO sharepoint_uploads
               (sp_item_id, project_id, web_url, uploaded_by_user_id, uploaded_by_name, uploaded_by_email, uploaded_at)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(sp_item_id) DO UPDATE SET
               project_id          = excluded.project_id,
               web_url             = excluded.web_url,
               uploaded_by_user_id = excluded.uploaded_by_user_id,
               uploaded_by_name    = excluded.uploaded_by_name,
               uploaded_by_email   = excluded.uploaded_by_email,
               uploaded_at         = CURRENT_TIMESTAMP`
          )
          .bind(uploaded.id, projectId, uploaded.webUrl, auth.user.id, auth.user.name ?? auth.user.email, auth.user.email)
          .run();
        // Append-only history row (who/when; 'upload' vs 'replace' auto-derived).
        await logFileEvent(c.env.DB, {
          spItemId: uploaded.id,
          projectId,
          webUrl: uploaded.webUrl,
          filename: file.name,
          size: uploaded.size ?? content.byteLength ?? null,
          userId: auth.user.id,
          userName: auth.user.name ?? auth.user.email,
          userEmail: auth.user.email,
        });
        // Also stamp the response with what the UI will see on next refresh —
        // saves an extra round-trip.
        uploaded.createdByName = auth.user.name ?? auth.user.email;
        uploaded.createdAt = new Date().toISOString();
      } catch (err) {
        console.warn("[sp.upload] attribution insert failed:", err instanceof Error ? err.message : err);
      }
    }

    return c.json({ file: uploaded });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upload to SharePoint";
    console.error("SharePoint upload error:", message);
    return c.json({ error: message }, 500);
  }
});

// POST /api/sharepoint/upload-session?url=folderUrl
// Body: { filename }
// Starts a Graph resumable upload session and returns a pre-authenticated
// uploadUrl the BROWSER uploads chunks to directly (bypassing this Worker's
// body/memory limits). Used for large files; small files use POST /upload.
app.post("/upload-session", async (c) => {
  const folderUrl = c.req.query("url");
  if (!folderUrl) return c.json({ error: "url required" }, 400);
  let body: { filename?: string };
  try { body = await c.req.json(); } catch { return c.json({ error: "invalid body" }, 400); }
  const filename = (body.filename ?? "").trim();
  if (!filename) return c.json({ error: "filename required" }, 400);
  try {
    const session = await createSharePointUploadSession(c.env, folderUrl, filename);
    return c.json(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create upload session";
    console.error("SharePoint upload-session error:", message);
    return c.json({ error: message }, 502);
  }
});

// POST /api/sharepoint/upload-complete
// Body: { spItemId, webUrl, projectId?, description? }
// Called by the client after a chunked upload finishes (the browser gets the
// final driveItem straight from Graph). Sets the description (Graph PATCH) and
// shadows the upload in sharepoint_uploads for uploader attribution — the same
// bookkeeping the simple POST /upload does server-side.
app.post("/upload-complete", async (c) => {
  const auth = c.get("auth");
  let body: { spItemId?: string; webUrl?: string; projectId?: string | null; description?: string | null };
  try { body = await c.req.json(); } catch { return c.json({ error: "invalid body" }, 400); }
  const spItemId = (body.spItemId ?? "").trim();
  const webUrl = (body.webUrl ?? "").trim();
  if (!spItemId || !webUrl) return c.json({ error: "spItemId and webUrl required" }, 400);

  // Description is best-effort — the file is already uploaded regardless.
  if (body.description?.trim()) {
    try { await updateSharePointFileDescription(c.env, webUrl, body.description.trim()); }
    catch (err) { console.warn("[sp.upload-complete] description set failed:", err instanceof Error ? err.message : err); }
  }

  // Attribution shadow — only for project folders (project FK), matching /upload.
  if (body.projectId && auth?.user) {
    try {
      await c.env.DB
        .prepare(
          `INSERT INTO sharepoint_uploads
             (sp_item_id, project_id, web_url, uploaded_by_user_id, uploaded_by_name, uploaded_by_email, uploaded_at)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(sp_item_id) DO UPDATE SET
             project_id          = excluded.project_id,
             web_url             = excluded.web_url,
             uploaded_by_user_id = excluded.uploaded_by_user_id,
             uploaded_by_name    = excluded.uploaded_by_name,
             uploaded_by_email   = excluded.uploaded_by_email,
             uploaded_at         = CURRENT_TIMESTAMP`
        )
        .bind(spItemId, body.projectId, webUrl, auth.user.id, auth.user.name ?? auth.user.email, auth.user.email)
        .run();
      // Append-only history row. Filename is derived from the web URL's last
      // segment (the chunked path doesn't carry the original File here).
      const filename = (() => { try { return decodeURIComponent(webUrl.split("/").pop() ?? "") || null; } catch { return null; } })();
      await logFileEvent(c.env.DB, {
        spItemId,
        projectId: body.projectId,
        webUrl,
        filename,
        size: null,
        userId: auth.user.id,
        userName: auth.user.name ?? auth.user.email,
        userEmail: auth.user.email,
      });
    } catch (err) {
      console.warn("[sp.upload-complete] attribution insert failed:", err instanceof Error ? err.message : err);
    }
  }

  return c.json({ ok: true });
});

// PATCH /api/sharepoint/file/description?webUrl=xxx
// Body: { description: string | null }
// Updates the description on an existing SharePoint file. Used to backfill
// context on files uploaded via the SP web UI directly.
app.patch("/file/description", async (c) => {
  const webUrl = c.req.query("webUrl");
  if (!webUrl) return c.json({ error: "webUrl required" }, 400);
  let body: { description?: string | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "JSON body required" }, 400);
  }
  try {
    const file = await updateSharePointFileDescription(c.env, webUrl, body.description ?? null);
    return c.json({ file });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update description";
    console.error("SharePoint description update error:", message);
    return c.json({ error: message }, 500);
  }
});

// GET /api/sharepoint/file/history?spItemId=xxx
// Returns the append-only upload/replace history for a file (newest first) so
// the UI can show a "who changed this, when" timeline. Visible to anyone who can
// already see the file (the file list itself is access-controlled upstream).
app.get("/file/history", async (c) => {
  const spItemId = c.req.query("spItemId");
  if (!spItemId) return c.json({ error: "spItemId required" }, 400);
  try {
    const rows = await c.env.DB
      .prepare(
        `SELECT id, action, filename, size, actor_name, actor_email, created_at
         FROM sharepoint_file_events WHERE sp_item_id = ? ORDER BY created_at DESC`
      )
      .bind(spItemId)
      .all();
    return c.json({ events: rows.results ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load file history";
    console.error("SharePoint file-history error:", message);
    return c.json({ error: message }, 500);
  }
});

// DELETE /api/sharepoint/file?webUrl=xxx
// Deletes a file by its SharePoint web URL. Also cleans up its sharepoint_uploads
// attribution row (by web_url) — best-effort, leftover rows are harmless.
app.delete("/file", async (c) => {
  const webUrl = c.req.query("webUrl");
  if (!webUrl) return c.json({ error: "webUrl required" }, 400);

  try {
    await deleteSharePointFile(c.env, webUrl);
    try {
      await c.env.DB.batch([
        c.env.DB.prepare("DELETE FROM sharepoint_uploads WHERE web_url = ?").bind(webUrl),
        c.env.DB.prepare("DELETE FROM sharepoint_file_events WHERE web_url = ?").bind(webUrl),
      ]);
    } catch (cleanupErr) {
      console.warn("[sp.delete] attribution cleanup failed:", cleanupErr instanceof Error ? cleanupErr.message : cleanupErr);
    }
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete SharePoint file";
    console.error("SharePoint delete error:", message);
    return c.json({ error: message }, 500);
  }
});

// POST /api/sharepoint/enable-app-auth
// Uses the app's SharePointTenantSettings.ReadWrite.All Graph permission to
// enable app-only auth on the SharePoint tenant — equivalent to:
//   Set-PnPTenant -DisableCustomAppAuthentication $false
app.post("/enable-app-auth", async (c) => {
  try {
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${c.env.DYNAMICS_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: c.env.DYNAMICS_CLIENT_ID ?? "",
          client_secret: c.env.DYNAMICS_CLIENT_SECRET ?? "",
          scope: "https://graph.microsoft.com/.default",
        }),
      }
    );
    if (!tokenRes.ok) return c.json({ error: `Token fetch failed: ${await tokenRes.text()}` }, 500);
    const { access_token } = await tokenRes.json() as { access_token: string };

    // Read current value first
    const getRes = await fetch("https://graph.microsoft.com/v1.0/admin/sharepoint/settings", {
      headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" },
    });
    const before = getRes.ok ? await getRes.json() : null;

    const patchRes = await fetch("https://graph.microsoft.com/v1.0/admin/sharepoint/settings", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ isAppOnlyAuthEnabled: true }),
    });

    if (!patchRes.ok) {
      const detail = await patchRes.text();
      return c.json({ error: `Graph PATCH failed: ${patchRes.status}`, detail, before }, 500);
    }

    const after = await patchRes.json();
    return c.json({ ok: true, before, after });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

// GET /api/sharepoint/debug-token
// Fetches a fresh Graph token and returns its decoded claims (app ID, roles/permissions).
// Use this to verify which app is being used and what Graph permissions it has.
app.get("/debug-token", async (c) => {
  try {
    // Force-fresh token (bypass cache)
    await c.env.KV.delete("graph:token");

    const res = await fetch(
      `https://login.microsoftonline.com/${c.env.DYNAMICS_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: c.env.DYNAMICS_CLIENT_ID ?? "",
          client_secret: c.env.DYNAMICS_CLIENT_SECRET ?? "",
          scope: "https://graph.microsoft.com/.default",
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return c.json({ error: `Token fetch failed: ${res.status}`, detail: text }, 500);
    }

    const data = await res.json() as { access_token: string; expires_in: number };

    // Decode JWT payload (middle segment) without verification — just for inspection
    const parts = data.access_token.split(".");
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));

    return c.json({
      app_id: payload.appid ?? payload.azp,
      tenant_id: payload.tid,
      roles: payload.roles ?? [],
      expires_in: data.expires_in,
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

// POST /api/sharepoint/clear-token-cache
// Clears the cached Graph token so a fresh one is fetched on next request.
// Useful after changing app registration permissions.
app.post("/clear-token-cache", async (c) => {
  await Promise.all([
    c.env.KV.delete("graph:token"),
    c.env.KV.delete("sp:token:https://packetfusioncrm.sharepoint.com"), // legacy SP REST token
  ]);
  return c.json({ ok: true, message: "Token cache cleared" });
});

export default app;
