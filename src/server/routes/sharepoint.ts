import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import {
  getSharePointLocations,
  listSharePointFiles,
  uploadToSharePoint,
  deleteSharePointFile,
} from "../services/graphService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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

// GET /api/sharepoint/files?url=xxx
// Lists files in a SharePoint folder by its absolute URL
app.get("/files", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ error: "url required" }, 400);

  try {
    const files = await listSharePointFiles(c.env, url);
    return c.json({ files });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list SharePoint files";
    console.error("SharePoint files error:", message);
    return c.json({ error: message }, 500);
  }
});

// POST /api/sharepoint/upload?url=xxx
// Uploads a file to a SharePoint folder. Expects multipart/form-data with a "file" field.
app.post("/upload", async (c) => {
  const folderUrl = c.req.query("url");
  if (!folderUrl) return c.json({ error: "url required" }, 400);

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
      file.type || "application/octet-stream"
    );

    return c.json({ file: uploaded });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upload to SharePoint";
    console.error("SharePoint upload error:", message);
    return c.json({ error: message }, 500);
  }
});

// DELETE /api/sharepoint/file?webUrl=xxx
// Deletes a file by its SharePoint web URL
app.delete("/file", async (c) => {
  const webUrl = c.req.query("webUrl");
  if (!webUrl) return c.json({ error: "webUrl required" }, 400);

  try {
    await deleteSharePointFile(c.env, webUrl);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete SharePoint file";
    console.error("SharePoint delete error:", message);
    return c.json({ error: message }, 500);
  }
});

// POST /api/sharepoint/clear-token-cache
// Clears the cached Graph token so a fresh one is fetched on next request.
// Useful after changing app registration permissions.
app.post("/clear-token-cache", async (c) => {
  await c.env.KV.delete("graph:token");
  return c.json({ ok: true, message: "Graph token cache cleared" });
});

export default app;
