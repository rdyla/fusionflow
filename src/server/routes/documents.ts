import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Bindings, Variables } from "../types";
import { canViewProject, canEditProject } from "../services/accessService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── List documents ─────────────────────────────────────────────────────────

app.get("/:id/documents", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await db
    .prepare(
      `SELECT d.id, d.project_id, d.phase_id, d.task_id, d.name, d.content_type,
              d.size_bytes, d.category, d.uploaded_by, d.created_at,
              u.name AS uploader_name
       FROM documents d
       LEFT JOIN users u ON u.id = d.uploaded_by
       WHERE d.project_id = ?
       ORDER BY d.created_at DESC`
    )
    .bind(projectId)
    .all();

  return c.json(rows.results ?? []);
});

// ── Upload document ────────────────────────────────────────────────────────

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

app.post("/:id/documents", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const project = await db.prepare("SELECT id FROM projects WHERE id = ? LIMIT 1").bind(projectId).first();
  if (!project) throw new HTTPException(404, { message: "Project not found" });

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    throw new HTTPException(400, { message: "Expected multipart form data" });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    throw new HTTPException(400, { message: "Missing file field" });
  }

  if (file.size > MAX_SIZE_BYTES) {
    throw new HTTPException(413, { message: "File too large (max 50 MB)" });
  }

  const category = (formData.get("category") as string | null) ?? "Other";
  const phase_id = (formData.get("phase_id") as string | null) || null;
  const task_id = (formData.get("task_id") as string | null) || null;

  // Validate phase/task belong to this project
  if (phase_id) {
    const ph = await db.prepare("SELECT id FROM phases WHERE id = ? AND project_id = ? LIMIT 1").bind(phase_id, projectId).first();
    if (!ph) throw new HTTPException(400, { message: "Phase not found in this project" });
  }
  if (task_id) {
    const tk = await db.prepare("SELECT id FROM tasks WHERE id = ? AND project_id = ? LIMIT 1").bind(task_id, projectId).first();
    if (!tk) throw new HTTPException(400, { message: "Task not found in this project" });
  }

  const docId = crypto.randomUUID();
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const r2Key = `projects/${projectId}/${docId}/${safeFilename}`;

  await c.env.R2.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { projectId, docId, uploadedBy: auth.user.id },
  });

  await db
    .prepare(
      `INSERT INTO documents (id, project_id, phase_id, task_id, name, r2_key, content_type, size_bytes, category, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(docId, projectId, phase_id, task_id, file.name, r2Key, file.type || null, file.size, category, auth.user.id)
    .run();

  const created = await db
    .prepare(
      `SELECT d.id, d.project_id, d.phase_id, d.task_id, d.name, d.content_type,
              d.size_bytes, d.category, d.uploaded_by, d.created_at,
              u.name AS uploader_name
       FROM documents d
       LEFT JOIN users u ON u.id = d.uploaded_by
       WHERE d.id = ? LIMIT 1`
    )
    .bind(docId)
    .first();

  return c.json(created, 201);
});

// ── Download document ──────────────────────────────────────────────────────

app.get("/:id/documents/:docId/download", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const docId = c.req.param("docId");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const doc = await db
    .prepare("SELECT * FROM documents WHERE id = ? AND project_id = ? LIMIT 1")
    .bind(docId, projectId)
    .first<{ name: string; r2_key: string; content_type: string | null }>();

  if (!doc) throw new HTTPException(404, { message: "Document not found" });

  const object = await c.env.R2.get(doc.r2_key);
  if (!object) throw new HTTPException(404, { message: "File not found in storage" });

  const headers = new Headers();
  headers.set("Content-Type", doc.content_type ?? "application/octet-stream");
  headers.set("Content-Disposition", `attachment; filename="${doc.name}"`);
  if (object.size) headers.set("Content-Length", String(object.size));

  return new Response(object.body, { headers });
});

// ── Delete document ────────────────────────────────────────────────────────

app.delete("/:id/documents/:docId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const docId = c.req.param("docId");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const doc = await db
    .prepare("SELECT id, r2_key FROM documents WHERE id = ? AND project_id = ? LIMIT 1")
    .bind(docId, projectId)
    .first<{ id: string; r2_key: string }>();

  if (!doc) throw new HTTPException(404, { message: "Document not found" });

  await c.env.R2.delete(doc.r2_key);
  await db.prepare("DELETE FROM documents WHERE id = ?").bind(docId).run();

  return c.json({ success: true });
});

export default app;
