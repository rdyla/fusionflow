import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Bindings, Variables } from "../types";
import {
  getCases,
  getCase,
  createCase,
  updateCase,
  getCaseNotes,
  addCaseNote,
  addCaseAttachment,
  getAnnotationBody,
} from "../services/dynamicsService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// GET /api/support/cases?accountId=xxx
app.get("/cases", async (c) => {
  const user = c.var.auth?.user;

  // Client users are always scoped to their own linked CRM account
  if (user?.role === "client") {
    if (!user.dynamics_account_id) return c.json([]);
    try {
      const cases = await getCases(c.env, user.dynamics_account_id);
      return c.json(cases);
    } catch (err) {
      console.error("Support cases fetch error:", err);
      return c.json([]);
    }
  }

  // Internal staff: optional ?accountId= filter
  const accountId = c.req.query("accountId");
  try {
    const cases = await getCases(c.env, accountId);
    return c.json(cases);
  } catch (err) {
    console.error("Support cases fetch error:", err);
    return c.json([]);
  }
});

// POST /api/support/cases
app.post("/cases", async (c) => {
  const user = c.var.auth?.user;

  if (user?.role === "client" && !user.can_open_cases) {
    throw new HTTPException(403, { message: "Your account is not permitted to open cases" });
  }

  const body = await c.req.json<{
    title: string;
    description?: string;
    prioritycode?: number;
    casetypecode?: number;
    accountId?: string;
  }>();

  if (!body.title?.trim()) {
    throw new HTTPException(400, { message: "Title is required" });
  }

  // Client users are always scoped to their own CRM account
  const accountId = user?.role === "client"
    ? (user.dynamics_account_id ?? undefined)
    : (body.accountId || undefined);

  try {
    const created = await createCase(c.env, { ...body, accountId });
    return c.json(created, 201);
  } catch (err) {
    console.error("Support case create error:", err);
    throw new HTTPException(500, { message: "Failed to create case" });
  }
});

// GET /api/support/cases/:caseId
app.get("/cases/:caseId", async (c) => {
  const caseId = c.req.param("caseId");
  try {
    const incident = await getCase(c.env, caseId);
    if (!incident) throw new HTTPException(404, { message: "Case not found" });
    return c.json(incident);
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    console.error("Support case fetch error:", err);
    throw new HTTPException(500, { message: "Failed to fetch case" });
  }
});

// PATCH /api/support/cases/:caseId
app.patch("/cases/:caseId", async (c) => {
  const caseId = c.req.param("caseId");
  const body = await c.req.json<{
    title?: string;
    description?: string;
    statecode?: number;
    statuscode?: number;
    prioritycode?: number;
  }>();

  try {
    await updateCase(c.env, caseId, body);
    return c.json({ success: true });
  } catch (err) {
    console.error("Support case update error:", err);
    throw new HTTPException(500, { message: "Failed to update case" });
  }
});

// GET /api/support/cases/:caseId/notes
app.get("/cases/:caseId/notes", async (c) => {
  const caseId = c.req.param("caseId");
  try {
    const notes = await getCaseNotes(c.env, caseId);
    return c.json(notes);
  } catch (err) {
    console.error("Case notes fetch error:", err);
    return c.json([]);
  }
});

// POST /api/support/cases/:caseId/notes
app.post("/cases/:caseId/notes", async (c) => {
  const caseId = c.req.param("caseId");
  const body = await c.req.json<{ notetext: string; subject?: string }>();

  if (!body.notetext?.trim()) {
    throw new HTTPException(400, { message: "Note text is required" });
  }

  // Attribute note to the logged-in user — works for both DB users and CRM-derived clients
  const authUser = c.var.auth?.user;
  const authorLabel = authUser?.name ?? authUser?.email ?? "FusionFlow360";

  try {
    const note = await addCaseNote(c.env, caseId, {
      subject: body.subject ?? authorLabel,
      notetext: body.notetext,
    });
    return c.json(note, 201);
  } catch (err) {
    console.error("Case note create error:", err);
    throw new HTTPException(500, { message: "Failed to add note" });
  }
});

// POST /api/support/cases/:caseId/attachments (multipart)
app.post("/cases/:caseId/attachments", async (c) => {
  const caseId = c.req.param("caseId");
  const form = await c.req.formData();
  const file = form.get("file") as File | null;
  const noteText = (form.get("note") as string | null) ?? "";

  if (!file) throw new HTTPException(400, { message: "No file provided" });

  // Attribute to the logged-in user
  const authUser = c.var.auth?.user;
  const authorLabel = authUser?.name ?? authUser?.email ?? "FusionFlow360";

  // Encode file to base64
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  try {
    const note = await addCaseAttachment(c.env, caseId, {
      filename: file.name,
      mimetype: file.type || "application/octet-stream",
      documentbody: base64,
      subject: `${authorLabel}: ${file.name}`,
      notetext: noteText,
    });
    return c.json(note, 201);
  } catch (err) {
    console.error("Case attachment upload error:", err);
    throw new HTTPException(500, { message: "Failed to upload attachment" });
  }
});

// GET /api/support/cases/:caseId/attachments/:annotationId/download
app.get("/cases/:caseId/attachments/:annotationId/download", async (c) => {
  const annotationId = c.req.param("annotationId");
  const data = await getAnnotationBody(c.env, annotationId);

  if (!data?.documentbody) throw new HTTPException(404, { message: "Attachment not found" });

  const binary = atob(data.documentbody);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return c.body(bytes.buffer as ArrayBuffer, 200, {
    "Content-Type": data.mimetype || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(data.filename)}"`,
  });
});

export default app;
